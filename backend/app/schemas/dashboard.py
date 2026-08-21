"""#19 GET /dashboard/summary — 03_API_spec.md §3. S2 화면 전체를 이 응답 하나로 그린다."""

from datetime import date

from pydantic import BaseModel

from app.schemas.common import CategoryCode, CategoryTier
from app.schemas.payment import UpcomingPaymentOut


class DashboardCategoryOut(BaseModel):
    category_code: CategoryCode
    name_ko: str
    tier: CategoryTier
    is_active: bool
    planned_budget: int
    paid_amount: int
    progress_rate: float


class DashboardSummaryOut(BaseModel):
    wedding_date: date
    d_day: int
    total_budget: int
    total_paid: int
    total_planned: int
    remaining_budget: int
    categories: list[DashboardCategoryOut]
    upcoming_payments: list[UpcomingPaymentOut]
