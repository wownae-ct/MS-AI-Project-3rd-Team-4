"""#26 GET /reports/me — 03_API_spec.md §3-⑤. 마이 리포트(S5). Importer:
app/routers/wedding/dashboard.py 하나뿐(재작성 예정, 2026-08-26 라우터 폴더 리스트럭처링으로
app/routers/dashboard.py에서 이동). checklist_item_id/default_dday_offset의 int 타입은
v3.0 잔재 버그 — 실제
checklist_items PK는 UUID이고 날짜 개념 자체가 없다(04_DB_spec.md §0)."""

from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import CategoryCode
from app.schemas.payment import UpcomingPaymentOut


class BudgetSummaryOut(BaseModel):
    total_budget: int
    total_paid: int
    remaining_budget: int


class CategoryCompletionOut(BaseModel):
    category_code: CategoryCode
    progress_rate: float


class RecommendedCheckOut(BaseModel):
    checklist_item_id: UUID
    category_code: CategoryCode
    title: str
    priority: str


class ReportOut(BaseModel):
    budget_summary: BudgetSummaryOut
    category_completion: list[CategoryCompletionOut]
    upcoming_payments: list[UpcomingPaymentOut]
    next_recommended_checks: list[RecommendedCheckOut]
