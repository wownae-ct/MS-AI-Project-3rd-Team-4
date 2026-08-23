"""#6-10 실제 DB 로직. 03_API_spec.md ① 웨딩 핵심.

timeline-task(2026-08-24)에서 timeline_items/ai_invocations 생성 + wedding_date 변경 시
재계산을, payments-task(2026-08-24)에서 wedding_categories.paid_amount 계산과 PUT
/wedding-categories의 BUDGET_BELOW_PAID 검증을 채웠다(아래 TODO(personalization-task)만 남음
— 개인화 라우터 에이전트가 붙기 전까지 checklist_items는 여전히 생성되지 않는다,
03_API_spec.md #6이 문서화한 대로 GET /checklist-items가 빈 배열을 반환하는 게 정상 동작).

여전히 범위 밖이라 TODO로 남긴 것:
  - checklist_items LLM 개인화 생성(personalization-task, 13_personalization_router_agent_design.md)."""

from datetime import UTC, date, datetime

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.categories import CATEGORY_META, CATEGORY_META_BY_CODE
from app.core.config import Settings
from app.core.errors import api_error
from app.models import AiInvocation, TimelineItem, User, Wedding, WeddingCategory
from app.schemas.wedding import (
    WeddingCategoriesUpdate,
    WeddingCategoryOut,
    WeddingCreate,
    WeddingUpdate,
)
from app.services.benchmark import get_latest_benchmark
from app.services.payment import get_paid_amounts_by_category
from app.services.timeline import generate_timeline_items, recalculate_timeline_dates


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
    # NO_PLAN: 오늘로부터 18개월 뒤(04_DB_schema.sql §4-③) — 월 단위 가산이라 timedelta(days=...)
    # 대신 연/월을 직접 계산한다(달마다 일수가 달라 days=548 같은 근사는 오차가 누적됨).
    total_month = today.month - 1 + 18
    target_year = year + total_month // 12
    target_month = total_month % 12 + 1
    return date(target_year, target_month, 1)


async def _resolve_total_budget(session: AsyncSession, payload: WeddingCreate) -> int:
    if not payload.total_budget_unsure:
        assert payload.total_budget is not None  # WeddingCreate 검증기가 이미 보장
        return payload.total_budget

    benchmark = await get_latest_benchmark(session, payload.region_code, "TOTAL", "TOTAL")
    if benchmark is None:
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
        wedding_date = approximate_wedding_date(
            datetime.now(UTC).date(), payload.wedding_date_precision
        )
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
        # 제약이 최종 방어선.
        await session.rollback()
        raise api_error(409, "WEDDING_ALREADY_EXISTS", "이미 웨딩 프로필이 있습니다.") from exc

    # 부작용: wedding_categories 9행 전부 켜짐(is_active=True), 예산 0원으로 생성 —
    # CATEGORY_META(app/core/categories.py)가 카테고리 목록의 단일 소스.
    for meta in CATEGORY_META:
        session.add(
            WeddingCategory(
                wedding_id=wedding.id,
                category_code=meta.code,
                is_active=True,
                planned_budget=0,
                display_order=meta.display_order,
            )
        )

    # ai_invocations 먼저 flush해 id를 채번 — timeline_items.generated_by_run_id가 이 id를 참조.
    ai_invocation = AiInvocation(
        wedding_id=wedding.id,
        trigger="ONBOARDING_INITIAL",
        affected_domains=["TIMELINE"],
        status="SUCCESS",
    )
    session.add(ai_invocation)
    await session.flush()

    # 새 웨딩은 9개 카테고리 전부 방금 is_active=True로 켰으므로 전체 집합을 active로 넘긴다.
    active_categories = {meta.code for meta in CATEGORY_META}
    today = datetime.now(UTC).date()
    for row in generate_timeline_items(wedding_date, active_categories, payload.done_so_far, today):
        session.add(
            TimelineItem(wedding_id=wedding.id, generated_by_run_id=ai_invocation.id, **row)
        )

    # TODO(personalization-task): checklist_items LLM 생성 트리거(비동기, ai_invocations 위 1행에
    # affected_domains=["TIMELINE","CHECKLIST"]로 갱신). 개인화 라우터 에이전트
    # (13_personalization_router_agent_design.md)가 붙기 전까지 GET /checklist-items는 빈
    # 배열을 반환한다 — 03_API_spec.md #6이 문서화한 정상 동작.

    await session.commit()
    await session.refresh(wedding)
    return wedding


async def update_wedding(
    session: AsyncSession, wedding: Wedding, payload: WeddingUpdate
) -> Wedding:
    changed = payload.model_dump(exclude_unset=True)
    for field, value in changed.items():
        setattr(wedding, field, value)

    # 03_API_spec.md #8 부작용: wedding_date 또는 wedding_date_precision이 바뀌면 date_overridden
    # =false, status='TODO'인 timeline_items.target_date만 재계산 — 체크리스트 재생성을 포함한
    # 전체 개인화 재트리거(Should)는 하지 않는다(Must 최소구현).
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
    session: AsyncSession, wedding: Wedding, payload: WeddingCategoriesUpdate
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
    if total_planned > wedding.total_budget:
        over = total_planned - wedding.total_budget
        raise api_error(400, "BUDGET_EXCEEDED", f"배정 합계가 예산을 {over:,}원 초과합니다.")

    # 검증 2: category_code별 planned_budget >= SUM(payments.amount WHERE status='PAID').
    planned_budgets = {code: row.planned_budget for code, row in existing_by_code.items()}
    paid_amounts = await get_paid_amounts_by_category(session, wedding.id)
    violation = find_budget_below_paid_violation(planned_budgets, paid_amounts)
    if violation is not None:
        category_code, min_required = violation
        name_ko = CATEGORY_META_BY_CODE[category_code].name_ko
        raise api_error(
            400,
            "BUDGET_BELOW_PAID",
            f"{name_ko} 카테고리는 이미 {min_required:,}원을 지급해 그 아래로 예산을 낮출 수 없습니다.",
            category_code=category_code,
            min_required=min_required,
        )

    await session.commit()
    return await list_wedding_categories_out(session, wedding.id)
