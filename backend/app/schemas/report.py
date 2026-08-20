"""#23 GET /reports/me — 03_API_spec.md §3. 마이 리포트(S5)."""

from pydantic import BaseModel

from app.schemas.payment import UpcomingPaymentOut


class BudgetSummaryOut(BaseModel):
    total_budget: int
    total_paid: int
    remaining_budget: int


class CategoryCompletionOut(BaseModel):
    category_code: str
    progress_rate: float


class RecommendedCheckOut(BaseModel):
    checklist_item_id: int
    title: str
    default_dday_offset: int | None


class ReportOut(BaseModel):
    budget_summary: BudgetSummaryOut
    category_completion: list[CategoryCompletionOut]
    upcoming_payments: list[UpcomingPaymentOut]
    next_recommended_checks: list[RecommendedCheckOut]
