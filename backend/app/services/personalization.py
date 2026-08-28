"""개인화 라우터 에이전트 오케스트레이션 — 그래프 호출, SUCCESS/BLOCKED/FAILED 3경로별 DB 반영,
ai_invocations 감사로그 기록. 13_personalization_router_agent_design.md §1-4/§2.

FIELD_UPDATED 재트리거(app/services/wedding.py의 update_wedding/update_wedding_categories)에서
protected_items(user_edited_at 있는 행)는 DB에서 직접 조회해 그래프 few-shot에 참고로만
넘기고, affected_domains에 든 도메인의 기존 행 중 protected가 아닌 것만 지운 뒤 새로 생성한
행으로 교체한다 — 사용자가 이미 체크하거나 메모를 남긴 항목은 재생성으로 사라지지 않는다.

이 모듈이 커밋하지 않는다 — 호출자(app/services/wedding.py)의 더 큰 트랜잭션 일부로 flush만
하고, 최종 commit은 호출자가 한다(온보딩 시 wedding_categories 등 다른 행들과 원자적으로 함께
커밋되어야 하므로)."""

import logging
from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.checklist_catalog import CHECKLIST_FALLBACK_CATALOG, GROUP_LABEL_BY_ITEM_TYPE
from app.core.config import Settings
from app.core.timezone import today_kst
from app.core.tracing import traced_span
from app.models import AiInvocation, ChecklistItem, TimelineItem, Wedding, WeddingCategory
from app.personalization.graph import build_graph
from app.personalization.state import PersonalizationState
from app.services.checklist import default_status_for_category
from app.services.timeline import (
    compute_prep_scale_factor,
    generate_timeline_items,
    scale_dday_offset,
)

logger = logging.getLogger(__name__)

_GRAPH = build_graph()


async def _fetch_protected_items(session: AsyncSession, wedding_id: UUID) -> dict[str, list[dict]]:
    """설계 문서 §1-1: protected_items = user_edited_at이 있는(=사용자가 PATCH로 한 번이라도
    건드린) 행. ONBOARDING_INITIAL은 아직 행 자체가 없어 항상 빈 리스트를 반환한다.

    id뿐 아니라 category_code/title도 같이 담는다(2026-08-26 레드팀 감사 3라운드 MEDIUM #7 —
    이전엔 id만 넘겨서 "이 UUID는 다시 만들지 마라"는 프롬프트 지시를 LLM이 지킬 방법이 아예
    없었다: UUID만으로는 그게 무슨 항목인지 알 수 없다. title/category_code가 있어야 프롬프트가
    구체적으로 "이 제목은 다시 만들지 마라"를 전달할 수 있고, validate도 새 항목이 이미 보호된
    항목과 제목이 겹치는지 검증할 수 있다."""
    checklist_rows = (
        await session.execute(
            select(ChecklistItem.id, ChecklistItem.category_code, ChecklistItem.title).where(
                ChecklistItem.wedding_id == wedding_id,
                ChecklistItem.user_edited_at.is_not(None),
            )
        )
    ).all()
    timeline_rows = (
        await session.execute(
            select(TimelineItem.id, TimelineItem.category_code, TimelineItem.title).where(
                TimelineItem.wedding_id == wedding_id,
                TimelineItem.user_edited_at.is_not(None),
            )
        )
    ).all()
    return {
        "CHECKLIST": [
            {"id": str(row.id), "category_code": row.category_code, "title": row.title}
            for row in checklist_rows
        ],
        "TIMELINE": [
            {"id": str(row.id), "category_code": row.category_code, "title": row.title}
            for row in timeline_rows
        ],
    }


async def _fetch_done_timeline_categories(session: AsyncSession, wedding_id: UUID) -> set[str]:
    """트러블슈팅 STEP 2 — FIELD_UPDATED/MANUAL_REGENERATE는 done_so_far를 넘길 방법이 없다
    (그 시점엔 과거 온보딩 답변이 DB 어디에도 원본 형태로 안 남아있고, 오직 "타임라인 행의
    현재 status"로만 남아있다). done_so_far가 아예 안 넘어온 경우에만 호출되며, 현재
    status="DONE"인 미보호 TIMELINE 행의 category_code를 모아 done_so_far와 동일한 의미로
    재사용한다 — 재생성 후에도 "이미 완료로 답한 카테고리"가 다시 TODO로 되돌아가지 않는다."""
    rows = (
        await session.execute(
            select(TimelineItem.category_code).where(
                TimelineItem.wedding_id == wedding_id,
                TimelineItem.status == "DONE",
                TimelineItem.user_edited_at.is_(None),
                TimelineItem.category_code.is_not(None),
            )
        )
    ).all()
    return {row.category_code for row in rows}


async def _delete_unprotected_items(
    session: AsyncSession, wedding_id: UUID, affected_domains: list[str]
) -> None:
    """재생성 대상 도메인(affected_domains)의 기존 행 중 protected(user_edited_at 있음)가 아닌
    행만 지운다 — FIELD_UPDATED 재생성이 사용자가 직접 수정한 항목을 덮어쓰지 않게 하는 축.
    ONBOARDING_INITIAL은 애초에 기존 행이 없어 no-op이다."""
    if "CHECKLIST" in affected_domains:
        await session.execute(
            delete(ChecklistItem).where(
                ChecklistItem.wedding_id == wedding_id,
                ChecklistItem.user_edited_at.is_(None),
            )
        )
    if "TIMELINE" in affected_domains:
        await session.execute(
            delete(TimelineItem).where(
                TimelineItem.wedding_id == wedding_id,
                TimelineItem.user_edited_at.is_(None),
            )
        )


def _build_profile(
    wedding: Wedding, active_categories: set[str], selected_options: dict[str, list[str]]
) -> dict:
    """selected_options는 호출자(run_personalization)가 미리 조회해 넘긴다 — 이 함수는 순수
    로직으로 유지(DB 세션 없이 임의의 값으로 결정론적 테스트 가능, services/wedding.py::
    approximate_wedding_date()와 같은 컨벤션)."""
    return {
        "active_categories": sorted(active_categories),
        "wedding_date": wedding.wedding_date.isoformat(),
        "wedding_date_precision": wedding.wedding_date_precision,
        "user_role": wedding.user_role,
        "total_budget": wedding.total_budget,
        "total_budget_unsure": wedding.total_budget_unsure,
        "region_code": wedding.region_code,
        "guest_count": wedding.guest_count,
        "guest_count_unsure": wedding.guest_count_unsure,
        "taste_preference": wedding.taste_preference,
        "venue_priority": wedding.venue_priority,
        "sdm_priority": wedding.sdm_priority,
        "primary_goals": wedding.primary_goals,
        "custom_request": wedding.custom_request,
        "selected_options": selected_options,
    }


def _timeline_status(
    category_code: str | None, done_categories: set[str], target_date: date, today: date
) -> str:
    return "DONE" if category_code in done_categories and target_date < today else "TODO"


def _checklist_row_from_draft(active_categories: set[str], item: dict) -> ChecklistItem | None:
    """generate 노드의 LLM 출력(SUCCESS 경로) 1건 → ChecklistItem. group_label/status는 LLM
    출력 스키마에 아예 없는 필드라(app/personalization/prompts.py) 여기서 결정론적으로 채운다."""
    category_code = item.get("category_code")
    if category_code not in active_categories:
        return None
    item_type = item.get("item_type") or "PREP"
    return ChecklistItem(
        category_code=category_code,
        origin="LLM",
        status=default_status_for_category(category_code),
        item_type=item_type,
        option_group=item.get("option_group"),
        group_label=GROUP_LABEL_BY_ITEM_TYPE.get(item_type, "확인 사항"),
        title=item["title"],
        body=item.get("body"),
        priority=item.get("priority") or "mid",
        tag=item.get("tag"),
        # source_tier/source_label/source_url: 대부분의 LLM 생성분은 인용 출처가 없어 None —
        # 03_API_spec.md #12에 source_tier: null → "AI 추천" 프론트 계약을 별도로 남긴다. FOCUS
        # 카테고리(VENUE/SDM)의 CONTRACT_TERM 항목만, app/personalization/graph.py::
        # generate_node가 DS3 RAG 검색 결과로 미리 채워둔 값이 있으면 여기 그대로 전달된다
        # (이 함수는 그 값을 신뢰만 하고 직접 검색하지 않음 — 검색/근거 판단은 generate_node의
        # 책임).
        source_tier=item.get("source_tier"),
        source_label=item.get("source_label"),
        source_url=item.get("source_url"),
    )


def _checklist_fallback_rows(active_categories: set[str]) -> list[ChecklistItem]:
    """BLOCKED/FAILED 폴백. active_categories로 반드시 먼저 필터링한다 — CHECKLIST_FALLBACK_
    CATALOG는 VENUE 25(CONTRACT_TERM 10 + EXTRA_COST 10 + PREP 5)+SDM 35(14+18+3) 고정이라,
    필터링 없이 그대로 꽂으면 비활성 카테고리에도 체크리스트가 생기는 버그가 난다."""
    return [
        ChecklistItem(
            category_code=item.category_code,
            origin="LLM",
            status=default_status_for_category(item.category_code),
            item_type=item.item_type,
            option_group=None,
            group_label=item.group_label,
            title=item.title,
            body=item.body,
            priority="high",
            source_tier=item.source_tier,
            source_label=item.source_label,
            source_url=item.source_url,
            display_order=item.display_order,
        )
        for item in CHECKLIST_FALLBACK_CATALOG
        if item.category_code in active_categories
    ]


def _timeline_row_from_draft(
    wedding_date: date,
    done_categories: set[str],
    today: date,
    display_order: int,
    item: dict,
    scale_factor: float,
) -> TimelineItem:
    """generate 노드의 LLM 출력(SUCCESS 경로) 1건 → TimelineItem. status도 LLM 출력 스키마에
    없는 필드라 done_so_far 로직(기존 generate_timeline_items와 동일 규칙)으로 결정론적으로
    채운다. offset은 scale_factor(호출부가 compute_prep_scale_factor로 1회 계산해 넘김)로
    실제 준비기간에 맞게 스케일된다(2026-08-28, generate_timeline_items의 카탈로그 경로와
    동일 규칙 — app/services/timeline.py 모듈 docstring 참고). done_so_far DONE 판정은 스케일
    전(raw) offset 기준 target_date로 한다 — generate_timeline_items 모듈 docstring의 이유와
    동일(2026-08-28 사용자 결정)."""
    raw_offset = item.get("default_dday_offset_days") or 0
    offset = scale_dday_offset(raw_offset, scale_factor)
    category_code = item.get("category_code")
    raw_target_date = wedding_date + timedelta(days=raw_offset)
    target_date = wedding_date + timedelta(days=offset)
    return TimelineItem(
        category_code=category_code,
        origin="LLM",
        status=_timeline_status(category_code, done_categories, raw_target_date, today),
        title=item["title"],
        target_date=target_date,
        default_dday_offset_days=offset,
        date_overridden=False,
        display_order=display_order,
    )


def _timeline_fallback_rows(
    wedding_date: date, active_categories: set[str], done_so_far: list[str] | None, today: date
) -> list[TimelineItem]:
    """BLOCKED/FAILED 폴백 — 기존 app/services/timeline.py::generate_timeline_items를 그대로
    재사용한다. 이 함수는 원래도 active_categories 파라미터로 필터링하는 기존 함수라 체크리스트
    폴백과 달리 새로 손댈 필요가 없다(각 dict에 origin="LLM"도 이미 들어있음)."""
    return [
        TimelineItem(**row)
        for row in generate_timeline_items(wedding_date, active_categories, done_so_far, today)
    ]


async def run_personalization(
    session: AsyncSession,
    settings: Settings,
    wedding: Wedding,
    active_categories: set[str],
    trigger: str,
    changed_fields: list[str] | None = None,
    done_so_far: list[str] | None = None,
    requested_domains: list[str] | None = None,
) -> AiInvocation:
    today = today_kst()
    protected_items = await _fetch_protected_items(session, wedding.id)
    # done_so_far가 명시적으로 넘어온 경우(ONBOARDING_INITIAL, 빈 리스트 포함)는 그 값을 그대로
    # 쓰고, 아예 안 넘어온 경우(FIELD_UPDATED/MANUAL_REGENERATE)만 DB의 현재 DONE 상태로
    # 대체한다(STEP 2) — 새 웨딩은 TIMELINE 행 자체가 없어 이 쿼리가 항상 빈 집합이라 안전하다.
    done_categories = (
        set(done_so_far)
        if done_so_far is not None
        else await _fetch_done_timeline_categories(session, wedding.id)
    )
    selected_options_rows = (
        await session.execute(
            select(WeddingCategory.category_code, WeddingCategory.selected_options).where(
                WeddingCategory.wedding_id == wedding.id,
                WeddingCategory.category_code.in_(active_categories),
                WeddingCategory.selected_options.is_not(None),
            )
        )
    ).all()
    selected_options = {code: options for code, options in selected_options_rows if options}

    initial_state: PersonalizationState = {
        "wedding_id": str(wedding.id),
        "trigger": trigger,
        "changed_fields": changed_fields or [],
        "profile": _build_profile(wedding, active_categories, selected_options),
        "protected_items": protected_items,
        "requested_domains": requested_domains or [],
        "affected_domains": [],
        "route_reasoning": "",
        "checklist_draft": None,
        "timeline_draft": None,
        "validation_status": "",
        "validation_errors": [],
        "retry_count": 0,
    }

    status = "SUCCESS"
    error_message: str | None = None
    affected_domains: list[str] = []
    checklist_rows: list[ChecklistItem] = []
    timeline_rows: list[TimelineItem] = []
    # 2026-08-25 결정 — validate→generate 재시도가 실제로 몇 번 일어났는지 Langfuse에 남긴다
    # (그래프 실행 후 result["retry_count"]로 갱신, 예외 경로는 0 그대로 — 재시도까지 못 갔으므로).
    retry_count = 0

    async with traced_span(
        "personalization",
        settings=settings,
        input={"trigger": trigger, "changed_fields": changed_fields},
        metadata={"wedding_id": str(wedding.id), "active_categories": sorted(active_categories)},
        user_id=str(wedding.owner_user_id),  # 이메일 등 PII 대신 UUID만 전달
    ) as trace:
        try:
            result = await _GRAPH.ainvoke(
                initial_state, {"configurable": {"settings": settings, "session": session}}
            )
            affected_domains = result["affected_domains"]
            domain_statuses: dict[str, str] = result["validation_status"]
            domain_errors: dict[str, list[str]] = result["validation_errors"]
            retry_count = result.get("retry_count", 0)

            # 도메인별로 완전히 독립 적용한다 — 한쪽이 BLOCKED라고 다른 쪽까지 폴백시키지
            # 않는다(2026-08-24 버그 수정: 이전엔 result["validation_status"]가 단일 값이라
            # CHECKLIST만 실패해도 이미 통과한 TIMELINE까지 폴백 카탈로그로 버려졌다).
            if "CHECKLIST" in affected_domains:
                if domain_statuses.get("CHECKLIST") == "SUCCESS":
                    checklist_rows = [
                        row
                        for row in (
                            _checklist_row_from_draft(active_categories, item)
                            for item in result["checklist_draft"] or []
                        )
                        if row is not None
                    ]
                else:
                    # 2026-08-26 레드팀 감사 4라운드 항목 5 — validate BLOCKED→카탈로그 폴백
                    # 전환이 무로깅이었다. CLAUDE.md에 기록된 "timeline category_code null-string
                    # bug 3rd recurrence"가 정확히 이 경로라, 로그가 있었으면 1~2번째 재발에서
                    # 잡혔을 사안 — BLOCKED 사유를 그대로 남긴다.
                    logger.warning(
                        "Personalization CHECKLIST BLOCKED for wedding_id=%s trigger=%s, "
                        "falling back to catalog: %s",
                        wedding.id,
                        trigger,
                        domain_errors.get("CHECKLIST"),
                    )
                    checklist_rows = _checklist_fallback_rows(active_categories)
            if "TIMELINE" in affected_domains:
                if domain_statuses.get("TIMELINE") == "SUCCESS":
                    scale_factor = compute_prep_scale_factor(today, wedding.wedding_date)
                    timeline_rows = [
                        _timeline_row_from_draft(
                            wedding.wedding_date, done_categories, today, idx, item, scale_factor
                        )
                        for idx, item in enumerate(result["timeline_draft"] or [], start=1)
                    ]
                else:
                    logger.warning(
                        "Personalization TIMELINE BLOCKED for wedding_id=%s trigger=%s, "
                        "falling back to catalog: %s",
                        wedding.id,
                        trigger,
                        domain_errors.get("TIMELINE"),
                    )
                    timeline_rows = _timeline_fallback_rows(
                        wedding.wedding_date, active_categories, sorted(done_categories), today
                    )

            # ai_invocations.status/error_message는 이 실행 전체를 요약하는 감사로그다 —
            # 도메인 중 하나라도 BLOCKED면 "완전히 깨끗한 성공은 아니었다"를 남긴다. 표시되는
            # 에러는 실제로 BLOCKED된 도메인의 것만(성공한 도메인의 빈 에러 리스트는 안 섞임).
            blocked_domains = [d for d in affected_domains if domain_statuses.get(d) != "SUCCESS"]
            if blocked_domains:
                status = "BLOCKED"
                error_message = "; ".join(
                    error for domain in blocked_domains for error in domain_errors.get(domain, [])
                )[:2000]
        except Exception as exc:
            # 이 그래프(app/personalization/graph.py)는 챗 그래프와 같은 "재시도 없음" 원칙이라
            # 노드 안에서 예외를 잡지 않는다 — LLM 호출 실패·JSON 파싱 실패 등 모든 예외가 여기까지
            # 전파되면 이 경계에서 한 번만 잡아 FAILED 기록 + 결정론적 폴백으로 안전하게 내려간다
            # (의도적 광범위 캐치 — 이 함수가 유일한 예외 경계). 2026-08-26 레드팀 감사 4라운드
            # 항목 4 — 이전엔 DB 컬럼(ai_invocations.error_message)에만 남고 stdout엔 안 남았다.
            logger.exception(
                "Personalization graph failed for wedding_id=%s trigger=%s", wedding.id, trigger
            )
            status = "FAILED"
            error_message = str(exc)[:2000]
            if trigger == "ONBOARDING_INITIAL":
                affected_domains = ["CHECKLIST", "TIMELINE"]
            elif trigger == "MANUAL_REGENERATE":
                affected_domains = requested_domains or []
            else:
                # FIELD_UPDATED는 route 노드가 실행조차 못 됐으니 실제로 어느 도메인이
                # 재생성 대상이었는지 알 방법이 없다(2026-08-26 레드팀 감사 3라운드 MEDIUM #5 —
                # 이전엔 여기서 affected_domains=[]로 둬서 다른 두 트리거와 달리 카탈로그
                # 폴백조차 없이 아무 것도 안 하고 조용히 끝났다). ROUTE_PROMPT_TEMPLATE 규칙
                # 5("애매하면 더 넓게 — 과소생성보다 과다생성이 안전")를 그대로 따라 두 도메인
                # 다 폴백 대상으로 삼는다.
                affected_domains = ["CHECKLIST", "TIMELINE"]
            if "CHECKLIST" in affected_domains:
                checklist_rows = _checklist_fallback_rows(active_categories)
            if "TIMELINE" in affected_domains:
                timeline_rows = _timeline_fallback_rows(
                    wedding.wedding_date, active_categories, sorted(done_categories), today
                )
        trace.update(
            metadata={
                "status": status,
                "affected_domains": affected_domains,
                "retry_count": retry_count,
            }
        )

    # affected_domains에 든 도메인은 SUCCESS/BLOCKED/FAILED 경로 어느 쪽이든 이미 새 내용으로
    # 대체하기로 결정된 상태다 — protected(user_edited_at 있음) 행만 남기고 나머지 기존 행을
    # 지운 뒤 아래에서 새 행을 꽂는다. ONBOARDING_INITIAL은 기존 행 자체가 없어 no-op.
    #
    # 2026-08-26 레드팀 감사 4라운드 항목 13 — 이 구간(삭제→ai_invocations insert→flush→행
    # insert)이 위 try/except 밖이라, 여기서 실패하면 무로깅으로 호출자까지 그대로 전파됐다
    # (app/main.py의 catch-all 핸들러가 결국 500으로 받아내긴 하지만, "개인화 DB 반영 단계에서
    # 실패했다"는 구체적 맥락은 안 남는다). 동작은 그대로(재전파) 두고 그 맥락만 남긴다.
    try:
        await _delete_unprotected_items(session, wedding.id, affected_domains)

        ai_invocation = AiInvocation(
            wedding_id=wedding.id,
            trigger=trigger,
            changed_fields=changed_fields,
            affected_domains=affected_domains,
            status=status,
            error_message=error_message,
            trace_ref=trace.trace_id,
        )
        session.add(ai_invocation)
        # checklist_rows/timeline_rows.generated_by_run_id가 이 id를 참조해야 해서 커밋 전에 flush.
        await session.flush()

        for row in checklist_rows:
            row.wedding_id = wedding.id
            row.generated_by_run_id = ai_invocation.id
            session.add(row)
        for row in timeline_rows:
            row.wedding_id = wedding.id
            row.generated_by_run_id = ai_invocation.id
            session.add(row)
    except Exception:
        logger.exception(
            "Personalization DB write failed for wedding_id=%s trigger=%s affected_domains=%s",
            wedding.id,
            trigger,
            affected_domains,
        )
        raise

    return ai_invocation
