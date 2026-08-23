"""#25 GET /dashboard/summary — 03_API_spec.md §3-⑤. S2 화면 전체를 이 응답 하나로 그린다."""

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import CategoryCode, CategoryTier


class DashboardCategoryOut(BaseModel):
    category_code: CategoryCode
    name_ko: str
    tier: CategoryTier
    is_active: bool
    planned_budget: int
    paid_amount: int
    progress_rate: float


class DashboardUpcomingItemOut(BaseModel):
    """timeline_items(날짜 있음)와 checklist_items(날짜 없음, 진행상태만)를 합친 결과라 source에
    따라 채워지는 필드가 다르다 — timeline은 target_date/d_day, checklist는 status
    (03_API_spec.md #25 응답 예시). category_code는 timeline_items 쪽이 범용 항목이면 null일 수
    있어(app/models/timeline.py) optional로 둔다."""

    source: Literal["timeline", "checklist"]
    id: UUID
    category_code: CategoryCode | None = None
    title: str
    target_date: date | None = None
    d_day: int | None = None
    status: str | None = None


class DashboardSummaryOut(BaseModel):
    wedding_date: date
    d_day: int
    total_budget: int
    total_paid: int
    total_planned: int
    remaining_budget: int
    categories: list[DashboardCategoryOut]
    upcoming_items: list[DashboardUpcomingItemOut]
