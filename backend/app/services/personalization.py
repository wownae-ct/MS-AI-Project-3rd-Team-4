"""개인화 라우터 에이전트 오케스트레이션 — 그래프 호출, SUCCESS/BLOCKED/FAILED 3경로별 DB 반영,
ai_invocations 감사로그 기록. 13_personalization_router_agent_design.md §1-4/§2.

FIELD_UPDATED 재트리거(app/services/wedding.py의 update_wedding/update_wedding_categories)에서
protected_items(user_edited_at 있는 행)는 DB에서 직접 조회해 그래프 few-shot에 참고로만
넘기고, affected_domains에 든 도메인의 기존 행 중 protected가 아닌 것만 지운 뒤 새로 생성한
행으로 교체한다 — 사용자가 이미 체크하거나 메모를 남긴 항목은 재생성으로 사라지지 않는다.

이 모듈이 커밋하지 않는다 — 호출자(app/services/wedding.py)의 더 큰 트랜잭션 일부로 flush만
하고, 최종 commit은 호출자가 한다(온보딩 시 wedding_categories 등 다른 행들과 원자적으로 함께
커밋되어야 하므로)."""

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.checklist_catalog import CHECKLIST_FALLBACK_CATALOG, GROUP_LABEL_BY_ITEM_TYPE
from app.core.config import Settings
from app.core.tracing import traced_span
from app.models import AiInvocation, ChecklistItem, TimelineItem, Wedding
from app.personalization.graph import build_graph
from app.personalization.state import PersonalizationState
from app.services.checklist import default_status_for_category
from app.services.timeline import generate_timeline_items

_GRAPH = build_graph()


async def _fetch_protected_items(session: AsyncSession, wedding_id: UUID) -> dict[str, list[str]]:
    """설계 문서 §1-1: protected_items = user_edited_at이 있는(=사용자가 PATCH로 한 번이라도
    건드린) 행의 id. ONBOARDING_INITIAL은 아직 행 자체가 없어 항상 빈 리스트를 반환한다."""
    checklist_ids = (
        (
            await session.execute(
                select(ChecklistItem.id).where(
                    ChecklistItem.wedding_id == wedding_id,
                    ChecklistItem.user_edited_at.is_not(None),
                )
            )
        )
        .scalars()
        .all()
    )
    timeline_ids = (
        (
            await session.execute(
                select(TimelineItem.id).where(
                    TimelineItem.wedding_id == wedding_id,
                    TimelineItem.user_edited_at.is_not(None),
                )
            )
        )
        .scalars()
        .all()
    )
    return {
        "CHECKLIST": [str(item_id) for item_id in checklist_ids],
        "TIMELINE": [str(item_id) for item_id in timeline_ids],
    }


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


def _build_profile(wedding: Wedding, active_categories: set[str]) -> dict:
    return {
        "active_categories": sorted(active_categories),
        "wedding_date": wedding.wedding_date.isoformat(),
        "wedding_date_precision": wedding.wedding_date_precision,
        "total_budget": wedding.total_budget,
        "region_code": wedding.region_code,
        "taste_preference": wedding.taste_preference,
        "venue_priority": wedding.venue_priority,
        "sdm_priority": wedding.sdm_priority,
        "primary_goals": wedding.primary_goals,
        "priorities": wedding.priorities,
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
        # source_tier/source_label/source_url: LLM 생성분은 인용 출처가 없어 전부 None —
        # 03_API_spec.md #12에 source_tier: null → "AI 추천" 프론트 계약을 별도로 남긴다.
    )


def _checklist_fallback_rows(active_categories: set[str]) -> list[ChecklistItem]:
    """BLOCKED/FAILED 폴백. active_categories로 반드시 먼저 필터링한다 — CHECKLIST_FALLBACK_
    CATALOG는 VENUE 10+SDM 14 고정이라, 필터링 없이 그대로 꽂으면 비활성 카테고리에도 체크리스트가
    생기는 버그가 난다."""
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
    wedding_date: date, done_categories: set[str], today: date, display_order: int, item: dict
) -> TimelineItem:
    """generate 노드의 LLM 출력(SUCCESS 경로) 1건 → TimelineItem. status도 LLM 출력 스키마에
    없는 필드라 done_so_far 로직(기존 generate_timeline_items와 동일 규칙)으로 결정론적으로
    채운다."""
    offset = item.get("default_dday_offset_days") or 0
    category_code = item.get("category_code")
    target_date = wedding_date + timedelta(days=offset)
    return TimelineItem(
        category_code=category_code,
        origin="LLM",
        status=_timeline_status(category_code, done_categories, target_date, today),
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
    today = datetime.now(UTC).date()
    protected_items = await _fetch_protected_items(session, wedding.id)
    done_categories = set(done_so_far or [])

    initial_state: PersonalizationState = {
        "wedding_id": str(wedding.id),
        "trigger": trigger,
        "changed_fields": changed_fields or [],
        "profile": _build_profile(wedding, active_categories),
        "protected_items": protected_items,
        "requested_domains": requested_domains or [],
        "affected_domains": [],
        "route_reasoning": "",
        "checklist_draft": None,
        "timeline_draft": None,
        "validation_status": "",
        "validation_errors": [],
    }

    status = "SUCCESS"
    error_message: str | None = None
    affected_domains: list[str] = []
    checklist_rows: list[ChecklistItem] = []
    timeline_rows: list[TimelineItem] = []

    async with traced_span(
        "personalization",
        settings=settings,
        input={"trigger": trigger, "changed_fields": changed_fields},
        metadata={"wedding_id": str(wedding.id), "active_categories": sorted(active_categories)},
        user_id=str(wedding.owner_user_id),  # 이메일 등 PII 대신 UUID만 전달
    ) as trace:
        try:
            result = await _GRAPH.ainvoke(initial_state, {"configurable": {"settings": settings}})
            affected_domains = result["affected_domains"]
            domain_statuses: dict[str, str] = result["validation_status"]
            domain_errors: dict[str, list[str]] = result["validation_errors"]

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
                    checklist_rows = _checklist_fallback_rows(active_categories)
            if "TIMELINE" in affected_domains:
                if domain_statuses.get("TIMELINE") == "SUCCESS":
                    timeline_rows = [
                        _timeline_row_from_draft(
                            wedding.wedding_date, done_categories, today, idx, item
                        )
                        for idx, item in enumerate(result["timeline_draft"] or [], start=1)
                    ]
                else:
                    timeline_rows = _timeline_fallback_rows(
                        wedding.wedding_date, active_categories, done_so_far, today
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
        except Exception as exc:  # noqa: BLE001
            # 이 그래프(app/personalization/graph.py)는 챗 그래프와 같은 "재시도 없음" 원칙이라
            # 노드 안에서 예외를 잡지 않는다 — LLM 호출 실패·JSON 파싱 실패 등 모든 예외가 여기까지
            # 전파되면 이 경계에서 한 번만 잡아 FAILED 기록 + 결정론적 폴백으로 안전하게 내려간다
            # (의도적 광범위 캐치 — 이 함수가 유일한 예외 경계).
            status = "FAILED"
            error_message = str(exc)[:2000]
            if trigger == "ONBOARDING_INITIAL":
                affected_domains = ["CHECKLIST", "TIMELINE"]
            elif trigger == "MANUAL_REGENERATE":
                affected_domains = requested_domains or []
            else:
                affected_domains = []
            if "CHECKLIST" in affected_domains:
                checklist_rows = _checklist_fallback_rows(active_categories)
            if "TIMELINE" in affected_domains:
                timeline_rows = _timeline_fallback_rows(
                    wedding.wedding_date, active_categories, done_so_far, today
                )
        trace.update(metadata={"status": status, "affected_domains": affected_domains})

    # affected_domains에 든 도메인은 SUCCESS/BLOCKED/FAILED 경로 어느 쪽이든 이미 새 내용으로
    # 대체하기로 결정된 상태다 — protected(user_edited_at 있음) 행만 남기고 나머지 기존 행을
    # 지운 뒤 아래에서 새 행을 꽂는다. ONBOARDING_INITIAL은 기존 행 자체가 없어 no-op.
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

    return ai_invocation
