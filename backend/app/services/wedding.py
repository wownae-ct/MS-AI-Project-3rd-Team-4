"""#2 POST /weddings, #6 PUT /weddings/me/categories 실제 DB 로직 (09_backend_implementation_plan.md
Phase 1 — 온보딩만 실구현, 나머지 21개 엔드포인트는 라우터에서 목 응답으로 남는다).

03_API_spec.md #2 부작용 3가지를 그대로 구현한다:
1) wedding_categories 7행 자동 생성(전부 is_active=true, planned_budget=0)
2) milestone_templates → user_milestones 복사(target_date = wedding_date + dday_offset_days)
3) completed_categories에 담긴 카테고리는, 그렇게 생성된 마일스톤 중 target_date가 오늘 이전인
   것만 최초부터 status='DONE'으로 만든다(카테고리 전체 완료 마킹이 아님)."""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import api_error
from app.models import Category, MilestoneTemplate, Payment, UserMilestone, Wedding, WeddingCategory
from app.schemas.wedding import WeddingCategoriesUpdate, WeddingCategoryOut, WeddingCreate


def approximate_wedding_date(today: date, date_precision: str) -> date:
    """date_precision != EXACT일 때 wedding_date를 대신할 대표 날짜(BASELINE §3 (1)-부칙).

    문서에 정확한 계산식이 없어 각 반기의 중간(대략 4/1, 10/1)을 대표값으로 잡았다. NO_PLAN은
    시기 자체가 없으므로 타임라인이 너무 촉박해 보이지 않도록 넉넉히 2년 뒤 1/1로 둔다
    (2026-08-21 판단 — 실제 서비스 전환 시 재검토 대상)."""
    year = today.year
    if date_precision == "APPROX_H2_THIS_YEAR":
        return date(year, 10, 1)
    if date_precision == "APPROX_H1_NEXT_YEAR":
        return date(year + 1, 4, 1)
    if date_precision == "APPROX_H2_NEXT_YEAR":
        return date(year + 1, 10, 1)
    return date(year + 2, 1, 1)  # NO_PLAN


async def create_wedding(session: AsyncSession, payload: WeddingCreate) -> Wedding:
    existing = (await session.execute(select(Wedding))).scalar_one_or_none()
    if existing is not None:
        raise api_error(409, "WEDDING_ALREADY_EXISTS", "이미 웨딩 프로필이 있습니다.")

    wedding_date = payload.wedding_date
    if payload.date_precision != "EXACT":
        wedding_date = approximate_wedding_date(datetime.now(UTC).date(), payload.date_precision)
    assert wedding_date is not None  # EXACT+None 조합은 WeddingCreate.model_validator가 이미 막음

    wedding = Wedding(
        wedding_date=wedding_date,
        wedding_date_precision=payload.date_precision,
        total_budget=payload.total_budget,
        region_code=payload.region_code,
        guest_count=payload.guest_count,
        user_role=payload.user_role,
        taste_preference=payload.taste_preference,
        venue_priority=payload.venue_priority,
        sdm_priority=payload.sdm_priority,
    )
    session.add(wedding)
    # 아직 commit(진짜 저장)은 안 하고 flush만 해서 wedding.id를 미리 받는다 — 바로 아래에서
    # 만드는 WeddingCategory/UserMilestone 행들이 이 id를 외래키로 가리켜야 하기 때문.
    await session.flush()

    # 부작용 ①: 카테고리 7개(예식장/스드메/상견례 등) 전부 이 웨딩용으로 한 벌씩 만들어준다.
    # 처음엔 전부 "켜짐(is_active=True)", 예산 0원 상태로 시작 — 사용자가 나중에 #6으로 조정.
    categories = (await session.execute(select(Category))).scalars().all()
    for category in categories:
        session.add(
            WeddingCategory(
                wedding_id=wedding.id,
                category_id=category.id,
                is_active=True,
                planned_budget=0,
                display_order=category.display_order,
            )
        )

    # 부작용 ②·③: 마일스톤 템플릿(전 카테고리 공통, 예: "상견례 잡기") 55개를 이 웨딩 전용
    # 일정(user_milestones)으로 전부 복사한다. target_date는 "결혼식으로부터 며칠 전"이라는
    # 템플릿의 상대 오프셋(dday_offset_days)을 실제 결혼 날짜에 더해서 계산.
    completed_category_ids = {c.id for c in categories if c.code in payload.completed_categories}
    today = datetime.now(UTC).date()
    templates = (await session.execute(select(MilestoneTemplate))).scalars().all()
    for template in templates:
        target_date = wedding_date + timedelta(days=template.dday_offset_days)
        # 온보딩에서 "이미 준비 끝냈다"고 체크한 카테고리(completed_category_ids)라면, 그 카테고리
        # 마일스톤 중 "원래 기한이 오늘보다 이미 지난 것"만 미리 DONE으로 만들어준다 — 카테고리를
        # 통째로 완료 처리하는 게 아니라, "이미 지났어야 할 일정만 골라서" 사후 소급 체크하는 것.
        already_done = template.category_id in completed_category_ids and target_date < today
        session.add(
            UserMilestone(
                wedding_id=wedding.id,
                template_id=template.id,
                category_id=template.category_id,
                title=template.title,
                target_date=target_date,
                status="DONE" if already_done else "TODO",
            )
        )

    await session.commit()
    await session.refresh(wedding)
    return wedding


async def list_wedding_categories_out(
    session: AsyncSession, wedding_id
) -> list[WeddingCategoryOut]:
    """#5/#6 공통 응답 조립 — paid_amount는 payments.status='PAID' 합계(계산값, 저장 안 함)."""
    paid_amount_expr = func.coalesce(func.sum(Payment.amount).filter(Payment.status == "PAID"), 0)
    stmt = (
        select(
            WeddingCategory.category_id,
            Category.code,
            Category.name_ko,
            Category.tier,
            WeddingCategory.is_active,
            WeddingCategory.planned_budget,
            WeddingCategory.display_order,
            Category.has_benchmark,
            Category.has_vendor_cases,
            paid_amount_expr.label("paid_amount"),
        )
        .join(Category, Category.id == WeddingCategory.category_id)
        .outerjoin(
            Payment,
            and_(
                Payment.wedding_id == WeddingCategory.wedding_id,
                Payment.category_id == WeddingCategory.category_id,
            ),
        )
        .where(WeddingCategory.wedding_id == wedding_id)
        .group_by(
            WeddingCategory.category_id,
            Category.code,
            Category.name_ko,
            Category.tier,
            WeddingCategory.is_active,
            WeddingCategory.planned_budget,
            WeddingCategory.display_order,
            Category.has_benchmark,
            Category.has_vendor_cases,
        )
        .order_by(WeddingCategory.display_order)
    )
    rows = (await session.execute(stmt)).all()
    return [
        WeddingCategoryOut(
            category_id=row.category_id,
            category_code=row.code,
            name_ko=row.name_ko,
            tier=row.tier,
            is_active=row.is_active,
            planned_budget=row.planned_budget,
            paid_amount=row.paid_amount,
            remaining=row.planned_budget - row.paid_amount,
            display_order=row.display_order,
            has_benchmark=row.has_benchmark,
            has_vendor_cases=row.has_vendor_cases,
        )
        for row in rows
    ]


async def update_wedding_categories(
    session: AsyncSession, wedding: Wedding, payload: WeddingCategoriesUpdate
) -> list[WeddingCategoryOut]:
    total = sum(item.planned_budget for item in payload.categories)
    if total > wedding.total_budget:
        over = total - wedding.total_budget
        raise api_error(400, "BUDGET_EXCEEDED", f"배정 합계가 예산을 {over:,}원 초과합니다.")

    existing_by_category = {
        row.category_id: row
        for row in (
            await session.execute(
                select(WeddingCategory).where(WeddingCategory.wedding_id == wedding.id)
            )
        ).scalars()
    }
    for item in payload.categories:
        row = existing_by_category.get(item.category_id)
        if row is None:
            raise api_error(
                404, "CATEGORY_NOT_FOUND", f"category_id={item.category_id}를 찾을 수 없습니다."
            )
        row.is_active = item.is_active
        row.planned_budget = item.planned_budget
        row.display_order = item.display_order
        row.skip_reason = item.skip_reason

    await session.commit()
    return await list_wedding_categories_out(session, wedding.id)
