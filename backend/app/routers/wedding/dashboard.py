"""#25 GET /dashboard/summary, #26 GET /reports/me — 03_API_spec.md §3-⑤. Importer:
app/routers/wedding/__init__.py(app.include_router로 wedding 패키지 router에 합쳐짐,
2026-08-26 라우터 폴더 리스트럭처링 이전엔 app/main.py가 직접 와이어링했다).

2026-08-24부로 실DB 집계로 전환. 카테고리 메타·예산 집계(planned_budget/paid_amount)는
app/services/wedding.py의 list_wedding_categories_out()을 그대로 재사용해 GET
/wedding-categories와 같은 계산을 두 번 짜지 않는다 — 체크리스트 진행률/우선순위 추천/다가오는
일정 결합 조회만 app/services/dashboard.py에서 새로 짰다.

remaining_budget은 두 엔드포인트 모두 total_budget - total_paid다(03_API_spec.md #25 field
table, #26 응답 예시 둘 다 이 산식으로 정합적이다 — #25 자체의 JSON 예시 숫자는 field table과
안 맞는 문서 오기로 보여 여기서는 field table을 따른다)."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.deps import get_current_wedding
from app.models import Wedding
from app.schemas.dashboard import (
    DashboardCategoryOut,
    DashboardSummaryOut,
    DashboardUpcomingItemOut,
)
from app.schemas.payment import UpcomingPaymentOut
from app.schemas.report import (
    BudgetSummaryOut,
    CategoryCompletionOut,
    RecommendedCheckOut,
    ReportOut,
)
from app.services.benchmark import get_latest_benchmark
from app.services.dashboard import (
    build_budget_benchmark,
    get_checklist_progress_by_category,
    list_next_recommended_checks,
    list_upcoming_items,
)
from app.services.payment import compute_d_day
from app.services.payment import list_upcoming_payments as list_upcoming_payments_service
from app.services.wedding import list_wedding_categories_out

router = APIRouter(tags=["dashboard"])

# #22 GET /payments/upcoming의 기본 조회 범위(app/routers/wedding/budget.py)와 동일하게 30일을 쓴다 —
# #26 스펙은 "#22와 동일 스키마"라고만 하고 조회 범위(days)는 명시하지 않아, 별도 값을 새로
# 만드는 대신 이미 쓰던 기본값을 그대로 따랐다.
REPORT_UPCOMING_PAYMENTS_DAYS = 30


@router.get("/dashboard/summary", response_model=DashboardSummaryOut)
async def dashboard_summary(
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> DashboardSummaryOut:
    today = datetime.now(UTC).date()
    all_categories = await list_wedding_categories_out(session, wedding.id)
    active_categories = [c for c in all_categories if c.is_active]
    active_category_codes = {c.category_code for c in active_categories}
    progress_by_category = await get_checklist_progress_by_category(session, wedding.id)
    upcoming_items = await list_upcoming_items(session, wedding.id, today, active_category_codes)

    total_paid = sum(c.paid_amount for c in active_categories)
    total_planned = sum(c.planned_budget for c in active_categories)
    # #23 /benchmarks/compare와 같은 TOTAL/TOTAL 특수값(app/models/benchmark.py) — 카테고리별
    # 비교가 아니라 "이 지역에서 결혼식 전체에 보통 얼마나 쓰는지" 지역 중간값과 total_budget을
    # 비교한다. #31 온보딩 placeholder(GET /benchmarks/total-average)와 같은 조회를 재사용.
    total_benchmark = await get_latest_benchmark(session, wedding.region_code, "TOTAL", "TOTAL")
    budget_benchmark = build_budget_benchmark(wedding.total_budget, total_benchmark)

    return DashboardSummaryOut(
        wedding_date=wedding.wedding_date,
        d_day=compute_d_day(wedding.wedding_date, today),
        total_budget=wedding.total_budget,
        total_paid=total_paid,
        total_planned=total_planned,
        remaining_budget=wedding.total_budget - total_paid,
        budget_benchmark=budget_benchmark,
        categories=[
            DashboardCategoryOut(
                category_code=c.category_code,
                name_ko=c.name_ko,
                tier=c.tier,
                is_active=c.is_active,
                planned_budget=c.planned_budget,
                paid_amount=c.paid_amount,
                progress_rate=progress_by_category.get(c.category_code, 0.0),
            )
            for c in active_categories
        ],
        upcoming_items=[DashboardUpcomingItemOut(**item) for item in upcoming_items],
    )


@router.get("/reports/me", response_model=ReportOut)
async def get_my_report(
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> ReportOut:
    today = datetime.now(UTC).date()
    all_categories = await list_wedding_categories_out(session, wedding.id)
    active_categories = [c for c in all_categories if c.is_active]
    active_category_codes = {c.category_code for c in active_categories}
    progress_by_category = await get_checklist_progress_by_category(session, wedding.id)
    upcoming_payments = await list_upcoming_payments_service(
        session, wedding.id, REPORT_UPCOMING_PAYMENTS_DAYS, today
    )
    recommended = await list_next_recommended_checks(session, wedding.id, active_category_codes)

    total_paid = sum(c.paid_amount for c in active_categories)

    return ReportOut(
        budget_summary=BudgetSummaryOut(
            total_budget=wedding.total_budget,
            total_paid=total_paid,
            remaining_budget=wedding.total_budget - total_paid,
        ),
        category_completion=[
            CategoryCompletionOut(
                category_code=c.category_code,
                progress_rate=progress_by_category.get(c.category_code, 0.0),
            )
            for c in active_categories
        ],
        upcoming_payments=[
            UpcomingPaymentOut(
                id=row.id,
                category_code=row.category_code,
                item_name=row.item_name,
                amount=row.amount,
                due_date=row.due_date,
                d_day=compute_d_day(row.due_date, today),
            )
            for row in upcoming_payments
        ],
        next_recommended_checks=[
            RecommendedCheckOut(
                checklist_item_id=item.id,
                category_code=item.category_code,
                title=item.title,
                priority=item.priority,
            )
            for item in recommended
        ],
    )
