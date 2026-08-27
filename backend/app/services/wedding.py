"""#6-10 실제 DB 로직. 03_API_spec.md ① 웨딩 핵심.

timeline-task(2026-08-24)에서 timeline_items/ai_invocations 생성 + wedding_date 변경 시
재계산을, payments-task(2026-08-24)에서 wedding_categories.paid_amount 계산과 PUT
/wedding-categories의 BUDGET_BELOW_PAID 검증을, personalization-task(2026-08-24)에서
개인화 라우터 에이전트(route→generate→validate, 13_personalization_router_agent_design.md)
연결을 채웠다. 온보딩 시 checklist_items/timeline_items 둘 다 이제 이 에이전트를 거쳐 생성된다
(app/services/personalization.py::run_personalization) — LLM generate가 실패/BLOCKED이면
결정론적 카탈로그(app/core/timeline_catalog.py, app/core/checklist_catalog.py)로 자동
폴백하므로 GET /checklist-items·/timeline-items는 온보딩 완료 즉시 항상 비어있지 않다.

field-updated-trigger-task(2026-08-24)에서 §1-2 규칙에 따른 FIELD_UPDATED 재트리거를
update_wedding()(날짜 외 필드 변경)과 update_wedding_categories()(카테고리 온/오프)에
연결했다 — wedding_date 단독 변경은 여전히 위 결정론적 재계산만 타고 에이전트를 부르지
않는다(규칙 3).

2026-08-28 — POST /weddings를 SSE(text/event-stream)로 전환(stream_wedding_creation).
red-bug.md §3 "온보딩 개인화 생성이 프론트 타임아웃보다 오래 걸리는 경우가 실사용 조건에서
실제로 발생"의 근본 원인 대응 — create_wedding() 안의 동기 run_personalization() 호출
(ONBOARDING_INITIAL, 실측 Langfuse p95=45.9초)이 대기 중 SSE 바이트를 하나도 안 내보내
nginx proxy-read-timeout/클라이언트 fetch 타임아웃에 걸릴 위험이 있었다 — chat SSE의
heartbeat 완화(app/rag/graph.py::_await_with_heartbeat, 2026-08-26)와 동일 패턴을 그대로
가져온다. create_wedding() 자체의 시그니처/로직은 전혀 안 바꾼다 — stream_wedding_creation()이
그 위에 얇게 heartbeat 래핑만 씌운다."""

import asyncio
import logging
from collections.abc import AsyncIterator
from datetime import date

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.categories import CATEGORY_META_BY_CODE
from app.core.config import Settings
from app.core.db import get_session_factory
from app.core.errors import api_error
from app.core.sse import sse_comment, sse_event
from app.core.timezone import today_kst
from app.models import AiInvocation, TimelineItem, User, Wedding, WeddingCategory
from app.schemas.sse import SseErrorEventData
from app.schemas.wedding import (
    WeddingCategoriesUpdate,
    WeddingCategoryOut,
    WeddingCreate,
    WeddingOut,
    WeddingUpdate,
)
from app.services.benchmark import get_latest_benchmark
from app.services.payment import get_paid_amounts_by_category
from app.services.personalization import run_personalization
from app.services.timeline import get_active_category_codes, recalculate_timeline_dates

logger = logging.getLogger(__name__)

# 13_personalization_router_agent_design.md §1-2 규칙 3: 본식일만 바뀌면 개인화 에이전트를
# 아예 부르지 않는다(날짜 재계산은 아래에서 항상 결정론적으로 처리, 콘텐츠 재생성 판단은 불필요) —
# route 노드가 LLM으로 "빈 도메인"을 판단하기 전에 서비스 레이어에서 먼저 걸러 LLM 호출 자체를
# 아낀다(ONBOARDING_INITIAL이 route LLM 호출을 생략하는 것과 같은 최적화 축).
_WEDDING_DATE_ONLY_FIELDS = frozenset({"wedding_date", "wedding_date_precision"})


def approximate_wedding_date(today: date, wedding_date_precision: str) -> date:
    """wedding_date_precision != EXACT일 때 wedding_date를 대신할 대표 날짜
    (04_DB_schema.sql §4-③ 근사 규칙, 03_API_spec.md #6)."""
    year = today.year
    if wedding_date_precision == "APPROX_H2_THIS_YEAR":
        return date(year, 10, 1)
    if wedding_date_precision == "APPROX_H1_NEXT_YEAR":
        return date(year + 1, 3, 15)
    if wedding_date_precision == "APPROX_H2_NEXT_YEAR":
        return date(year + 1, 9, 15)
    if wedding_date_precision == "APPROX_H1_YEAR_AFTER_NEXT":
        return date(year + 2, 3, 15)
    # NO_PLAN: 오늘로부터 18개월 뒤(04_DB_schema.sql §4-③) — 월 단위 가산이라 timedelta(days=...)
    # 대신 연/월을 직접 계산한다(달마다 일수가 달라 days=548 같은 근사는 오차가 누적됨).
    total_month = today.month - 1 + 18
    target_year = year + total_month // 12
    target_month = total_month % 12 + 1
    return date(target_year, target_month, 1)


def _raise_if_budget_exceeded(wedding_id, total_planned: int, total_budget: int) -> None:
    """Σplanned_budget이 total_budget을 넘으면 BUDGET_EXCEEDED(400) — create_wedding·
    update_wedding_categories가 공유한다(2026-08-27, 온보딩 단일 호출 재설계로 create_wedding도
    이 검증을 처음 필요로 하게 되면서 update_wedding_categories의 인라인 검증을 여기로 뽑아냈다:
    03_API_spec.md #10 검증 1과 완전히 동일한 불변식이라 중복 대신 공유 함수로 둔다)."""
    if total_planned > total_budget:
        over = total_planned - total_budget
        logger.info(
            "BUDGET_EXCEEDED for wedding_id=%s: planned=%s total_budget=%s",
            wedding_id,
            total_planned,
            total_budget,
        )
        raise api_error(400, "BUDGET_EXCEEDED", f"배정 합계가 예산을 {over:,}원 초과합니다.")


async def _resolve_total_budget(session: AsyncSession, payload: WeddingCreate) -> int:
    if not payload.total_budget_unsure:
        assert payload.total_budget is not None  # WeddingCreate 검증기가 이미 보장
        return payload.total_budget

    benchmark = await get_latest_benchmark(session, payload.region_code, "TOTAL", "TOTAL")
    if benchmark is None:
        # 2026-08-26 레드팀 감사 4라운드 항목 7 — 이 422로 온보딩 자체가 막히는데 무로깅이면
        # 어느 지역의 시드가 비어 있는지 사용자 문의 전엔 알 방법이 없다.
        logger.warning("Total budget benchmark unavailable for region_code=%s", payload.region_code)
        raise api_error(
            422,
            "TOTAL_BUDGET_UNAVAILABLE",
            "예산 미정 처리를 위한 지역 평균 데이터가 아직 없습니다. 직접 입력해주세요.",
        )
    return benchmark.median_price


async def create_wedding(
    session: AsyncSession, settings: Settings, user: User, payload: WeddingCreate
) -> Wedding:
    existing = (
        await session.execute(select(Wedding).where(Wedding.owner_user_id == user.id))
    ).scalar_one_or_none()
    if existing is not None:
        raise api_error(409, "WEDDING_ALREADY_EXISTS", "이미 웨딩 프로필이 있습니다.")

    wedding_date = payload.wedding_date
    if payload.wedding_date_precision != "EXACT":
        wedding_date = approximate_wedding_date(today_kst(), payload.wedding_date_precision)
    assert wedding_date is not None  # EXACT+None 조합은 WeddingCreate.model_validator가 이미 막음

    total_budget = await _resolve_total_budget(session, payload)

    wedding = Wedding(
        owner_user_id=user.id,
        user_role=payload.user_role,
        wedding_date=wedding_date,
        wedding_date_precision=payload.wedding_date_precision,
        total_budget=total_budget,
        total_budget_unsure=payload.total_budget_unsure,
        region_code=payload.region_code,
        guest_count=payload.guest_count,
        guest_count_unsure=payload.guest_count_unsure,
        taste_preference=payload.taste_preference,
        venue_priority=payload.venue_priority,
        sdm_priority=payload.sdm_priority,
        primary_goals=payload.primary_goals or None,
    )
    session.add(wedding)
    try:
        # wedding_categories 행들이 이 id를 외래키로 가리켜야 해서 커밋 전에 flush로 채번한다.
        await session.flush()
    except IntegrityError as exc:
        # owner_user_id UNIQUE 위반 — 위 select로 대부분 걸러지지만 동시 요청 레이스는 DB
        # 제약이 최종 방어선. 2026-08-26 레드팀 감사 4라운드 항목 19 — 이 레이스 자체가
        # 무로깅이라 실제로 얼마나 자주 일어나는지 관측할 방법이 없었다.
        logger.warning("Concurrent wedding creation race for user_id=%s", user.id)
        await session.rollback()
        raise api_error(409, "WEDDING_ALREADY_EXISTS", "이미 웨딩 프로필이 있습니다.") from exc

    # 2026-08-27 재설계 — 카테고리 활성/예산 배분을 payload.categories(WeddingCreate가 이미
    # 9개 전부·중복 없음을 검증했다)로 그대로 생성한다. 예전엔 여기서 9개 전부 is_active=True·
    # 0원으로 하드코딩해 만들고, 뒤이은 PUT /wedding-categories가 실제 값과 다르면 개인화를 또
    # 트리거했다(온보딩마다 동기 LLM 생성이 두 번 겹쳤다 — 실측 Langfuse p95=45.9초).
    #
    # 예산 검증(03_API_spec.md #10 검증 1과 동일 불변식)을 카테고리 행을 add하기 전에 한다 —
    # 위반 시 flush까지만 된 웨딩 row를 롤백하면 그만이고, 아직 세션에 넣지도 않은 카테고리
    # 객체를 되돌릴 필요가 없다.
    total_planned = sum(item.planned_budget for item in payload.categories)
    if total_planned > total_budget:
        await session.rollback()
        _raise_if_budget_exceeded(wedding.id, total_planned, total_budget)

    for item in payload.categories:
        session.add(
            WeddingCategory(
                wedding_id=wedding.id,
                category_code=item.category_code,
                is_active=item.is_active,
                planned_budget=item.planned_budget,
                display_order=item.display_order,
                selected_options=item.selected_options,
                skip_reason=item.skip_reason,
            )
        )

    # run_personalization이 ai_invocations 1행 기록 + checklist_items/timeline_items 생성(LLM
    # SUCCESS 또는 BLOCKED/FAILED 결정론적 폴백)을 전부 처리한다 — 여기서는 flush만 하고 커밋은
    # 아래에서 다른 온보딩 부작용과 함께 한 번에 한다. 활성 집합은 이제 하드코딩된 전체 9개가
    # 아니라 payload가 실제로 고른 값이다 — ONBOARDING_INITIAL이 처음부터 정확한 카테고리로만
    # 생성한다.
    active_categories = {item.category_code for item in payload.categories if item.is_active}
    await run_personalization(
        session,
        settings,
        wedding,
        active_categories,
        trigger="ONBOARDING_INITIAL",
        done_so_far=payload.done_so_far,
    )

    await session.commit()
    await session.refresh(wedding)
    return wedding


# nginx ingress의 proxy-read-timeout(120초, 2026-08-26 챗 SSE 완화 커밋 154e352가 Ingress
# 리소스 전체에 이미 올려둠 — 이 엔드포인트도 같은 Ingress를 타므로 별도 인프라 변경 불필요)
# 보다는 훨씬 짧게, chat과 동일한 간격으로 흘려보낸다. 15초 자체는 임의값이 아니라 chat 쪽
# _HEARTBEAT_INTERVAL_SECONDS(app/rag/graph.py)와 맞춘 것 — 두 값이 다를 이유가 없다.
_WEDDING_CREATE_HEARTBEAT_INTERVAL_SECONDS = 15.0


async def stream_wedding_creation(
    settings: Settings, user: User, payload: WeddingCreate
) -> AsyncIterator[str]:
    """create_wedding()을 SSE로 감싼다 — 성공하면 `event: done`(WeddingOut), 실패하면(409
    WEDDING_ALREADY_EXISTS/400 BUDGET_EXCEEDED 등) `event: error`(SseErrorEventData)를
    낸다. 응답이 이미 200 스트림으로 시작된 뒤라 HTTP 상태코드로는 더 이상 성패를 구분할 수
    없다 — chat SSE(app/services/chat.py)가 이미 쓰는 것과 동일한 트레이드오프.

    라우터가 주입하는 Depends(get_session) 세션을 파라미터로 받지 않고 자체적으로
    get_session_factory()로 새로 연다 — StreamingResponse를 반환하는 라우터 함수는 '리턴'하는
    즉시(스트리밍 바디가 실제로 소비되기 전에) yield 의존성을 정리해(session.close()) 그 세션을
    그대로 넘겨받으면 이 제너레이터가 실제로 실행될 땐 이미 닫힌 세션이 된다 —
    app/services/chat.py::stream_chat_response 모듈 docstring이 이미 문서화한 것과 정확히
    같은 문제를, 실제로 sqlalchemy.exc.MissingGreenlet으로 재현하고 나서 같은 방식으로
    고쳤다(2026-08-28)."""
    async with get_session_factory()() as session:
        task: asyncio.Task[Wedding] = asyncio.ensure_future(
            create_wedding(session, settings, user, payload)
        )
        while True:
            done, _pending = await asyncio.wait(
                {task}, timeout=_WEDDING_CREATE_HEARTBEAT_INTERVAL_SECONDS
            )
            if task in done:
                break
            yield sse_comment("heartbeat")

        try:
            wedding = task.result()
        except HTTPException as exc:
            error = exc.detail["error"]
            logger.info("create_wedding SSE error for user_id=%s: code=%s", user.id, error["code"])
            yield sse_event(
                "error", SseErrorEventData(code=error["code"], message=error["message"])
            )
            return

        yield sse_event("done", WeddingOut.model_validate(wedding))


async def update_wedding(
    session: AsyncSession, settings: Settings, wedding: Wedding, payload: WeddingUpdate
) -> Wedding:
    changed = payload.model_dump(exclude_unset=True)

    if "total_budget" in changed and changed["total_budget"] != wedding.total_budget:
        # 03_API_spec.md #8/#10: PUT /wedding-categories의 검증 1(Σ planned_budget <=
        # total_budget)과 대칭 — 반대 방향(total_budget을 배정 합계보다 낮춤)도 여기서 막아야
        # remaining_budget(#25/#26)이 조용히 음수가 되는 걸 막는다.
        total_planned = (
            await session.execute(
                select(func.coalesce(func.sum(WeddingCategory.planned_budget), 0)).where(
                    WeddingCategory.wedding_id == wedding.id
                )
            )
        ).scalar_one()
        if changed["total_budget"] < total_planned:
            over = total_planned - changed["total_budget"]
            # 2026-08-26 레드팀 감사 4라운드 항목 18 — 예산 관련 거부(400)들이 무로깅이었다.
            logger.info(
                "BUDGET_EXCEEDED on update_wedding for wedding_id=%s: planned=%s new_total=%s",
                wedding.id,
                total_planned,
                changed["total_budget"],
            )
            raise api_error(400, "BUDGET_EXCEEDED", f"배정 합계가 예산을 {over:,}원 초과합니다.")

    for field, value in changed.items():
        setattr(wedding, field, value)

    # 03_API_spec.md #8 부작용: wedding_date 또는 wedding_date_precision이 바뀌면 date_overridden
    # =false, status='TODO'인 timeline_items.target_date만 재계산 — 이건 콘텐츠 판단이 아니라
    # 산수라 개인화 에이전트를 거치지 않고 여기서 항상 결정론적으로 처리한다(설계 문서 §1 "중요한
    # 설계 원칙 하나").
    if "wedding_date" in changed or "wedding_date_precision" in changed:
        rows = (
            await session.execute(
                select(
                    TimelineItem.id,
                    TimelineItem.default_dday_offset_days,
                    TimelineItem.date_overridden,
                    TimelineItem.status,
                ).where(TimelineItem.wedding_id == wedding.id)
            )
        ).all()
        updates = recalculate_timeline_dates(wedding.wedding_date, [tuple(r) for r in rows])
        for item_id, new_target_date in updates.items():
            await session.execute(
                update(TimelineItem)
                .where(TimelineItem.id == item_id)
                .values(target_date=new_target_date)
            )
        session.add(
            AiInvocation(
                wedding_id=wedding.id,
                trigger="FIELD_UPDATED",
                changed_fields=[
                    f for f in ("wedding_date", "wedding_date_precision") if f in changed
                ],
                affected_domains=["TIMELINE"],
                status="SUCCESS",
            )
        )

    # 03_API_spec.md #8 Should 스코프: 날짜 외 필드(total_budget/taste_preference/venue_priority/
    # sdm_priority/primary_goals 등)가 바뀌면 개인화 라우터 에이전트를 FIELD_UPDATED로 재트리거해
    # 실제로 체크리스트/타임라인 중 뭘 다시 만들지는 route 노드의 LLM 판단에 맡긴다(13_
    # personalization_router_agent_design.md §1-2). wedding_date만 단독으로 바뀐 경우는 위
    # 블록에서 이미 끝났고 규칙 3("본식일만 바뀌면 아무 도메인도 선택하지 않음")이 결과가 항상
    # 빈 도메인일 것을 보장하므로, 그 경우엔 이 LLM 호출 자체를 생략한다.
    if changed.keys() - _WEDDING_DATE_ONLY_FIELDS:
        active_categories = await get_active_category_codes(session, wedding.id)
        await run_personalization(
            session,
            settings,
            wedding,
            active_categories,
            trigger="FIELD_UPDATED",
            changed_fields=list(changed.keys()),
        )

    await session.commit()
    await session.refresh(wedding)
    return wedding


def _wedding_category_out(row: WeddingCategory, paid_amount: int) -> WeddingCategoryOut:
    meta = CATEGORY_META_BY_CODE[row.category_code]
    return WeddingCategoryOut(
        category_code=row.category_code,
        name_ko=meta.name_ko,
        tier=meta.tier,
        is_active=row.is_active,
        planned_budget=row.planned_budget,
        paid_amount=paid_amount,
        remaining=row.planned_budget - paid_amount,
        selected_options=row.selected_options,
        display_order=row.display_order,
        has_benchmark=meta.has_benchmark,
        has_vendor_cases=meta.has_vendor_cases,
    )


def find_budget_below_paid_violation(
    planned_budgets: dict[str, int], paid_amounts: dict[str, int]
) -> tuple[str, int] | None:
    """03_API_spec.md #10 검증 2(DB I/O 없는 순수 함수): 카테고리별 planned_budget이 이미 지급된
    PAID 합계보다 낮아지지 않았는지 확인, 위반한 첫 (category_code, min_required) 쌍을 반환하고
    없으면 None."""
    for category_code, planned in planned_budgets.items():
        paid = paid_amounts.get(category_code, 0)
        if planned < paid:
            return category_code, paid
    return None


async def list_wedding_categories_out(
    session: AsyncSession, wedding_id
) -> list[WeddingCategoryOut]:
    rows = (
        (
            await session.execute(
                select(WeddingCategory)
                .where(WeddingCategory.wedding_id == wedding_id)
                .order_by(WeddingCategory.display_order)
            )
        )
        .scalars()
        .all()
    )
    paid_amounts = await get_paid_amounts_by_category(session, wedding_id)
    return [_wedding_category_out(row, paid_amounts.get(row.category_code, 0)) for row in rows]


async def update_wedding_categories(
    session: AsyncSession, settings: Settings, wedding: Wedding, payload: WeddingCategoriesUpdate
) -> list[WeddingCategoryOut]:
    # 03_API_spec.md §5: PUT 처리 중 갱신 직전에 재확인(TOCTOU 방지) — 같은 웨딩의 동시 PUT
    # 요청이 서로의 planned_budget 판단 근거를 덮어쓰지 못하게 잠근다.
    existing_by_code = {
        row.category_code: row
        for row in (
            await session.execute(
                select(WeddingCategory)
                .where(WeddingCategory.wedding_id == wedding.id)
                .with_for_update()
            )
        ).scalars()
    }
    previously_active = {code for code, row in existing_by_code.items() if row.is_active}

    for item in payload.categories:
        row = existing_by_code.get(item.category_code)
        if row is None:
            raise api_error(
                404,
                "CATEGORY_NOT_FOUND",
                f"category_code={item.category_code}를 찾을 수 없습니다.",
            )
        row.is_active = item.is_active
        row.planned_budget = item.planned_budget
        row.display_order = item.display_order
        row.selected_options = item.selected_options
        row.skip_reason = item.skip_reason

    # 검증 1: Σ planned_budget(9개 전체, is_active 무관 합산) <= total_budget
    # (04_DB_schema.sql §4-②, 03_API_spec.md #10 — payload에 없는 카테고리도 기존 값 그대로 합산).
    total_planned = sum(row.planned_budget for row in existing_by_code.values())
    _raise_if_budget_exceeded(wedding.id, total_planned, wedding.total_budget)

    # 검증 2: category_code별 planned_budget >= SUM(payments.amount WHERE status='PAID').
    planned_budgets = {code: row.planned_budget for code, row in existing_by_code.items()}
    paid_amounts = await get_paid_amounts_by_category(session, wedding.id)
    violation = find_budget_below_paid_violation(planned_budgets, paid_amounts)
    if violation is not None:
        category_code, min_required = violation
        name_ko = CATEGORY_META_BY_CODE[category_code].name_ko
        logger.info(
            "BUDGET_BELOW_PAID for wedding_id=%s category_code=%s min_required=%s",
            wedding.id,
            category_code,
            min_required,
        )
        raise api_error(
            400,
            "BUDGET_BELOW_PAID",
            f"{name_ko} 카테고리는 이미 {min_required:,}원을 지급해 그 아래로 예산을 낮출 수 없습니다.",
            category_code=category_code,
            min_required=min_required,
        )

    # 13_personalization_router_agent_design.md §1-2 규칙 1: 활성 카테고리가 바뀌면(카테고리
    # 온/오프) 체크리스트·타임라인 둘 다 재생성 대상 — 이 규칙 자체는 결정적이라 route 노드도
    # 항상 두 도메인 다 고를 것이지만, 실제 판단은 그래프(LLM)에 맡긴다(서비스 레이어에서
    # 하드코딩하지 않음 — 설계 문서가 라우팅 자체를 에이전트 책임으로 둔 원칙 유지).
    newly_active = {code for code, row in existing_by_code.items() if row.is_active}
    if newly_active != previously_active:
        # 2026-08-26 레드팀 감사 4라운드 항목 20 — 카테고리 활성/비활성 변경 시점이 무로깅이었다.
        # 이전 감사가 찾은 "cascade 누락" 버그가 정확히 이 트리거 지점이라, 로그가 있었으면
        # 더 일찍 잡혔을 사안 — 뭐가 켜지고/꺼졌는지 남긴다.
        logger.info(
            "Wedding categories changed for wedding_id=%s: %s -> %s",
            wedding.id,
            sorted(previously_active),
            sorted(newly_active),
        )
        await run_personalization(
            session,
            settings,
            wedding,
            newly_active,
            trigger="FIELD_UPDATED",
            changed_fields=["active_categories"],
        )

    await session.commit()
    return await list_wedding_categories_out(session, wedding.id)
