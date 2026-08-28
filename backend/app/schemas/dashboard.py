"""#25 GET /dashboard/summary — 03_API_spec.md §3-⑤. S2 화면 전체를 이 응답 하나로 그린다."""

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.benchmark import PercentileLabel
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


class DashboardBudgetBenchmarkOut(BaseModel):
    """total_budget을 price_benchmarks의 지역별 TOTAL/TOTAL 참가격(전체 웨딩 비용 중간값)과
    비교한 결과 — GET /benchmarks/compare(#23)와 필드명을 그대로 맞춰 프론트가 같은 배지
    컴포넌트를 재사용할 수 있게 한다. 해당 region_code에 TOTAL/TOTAL 참가격 데이터가 아직
    없으면(app/services/benchmark.py::get_latest_benchmark가 None) DashboardSummaryOut에서
    이 필드 자체가 null이 된다 — 대시보드 전체를 404로 막지 않는다."""

    region_code: str
    median_price: int
    ratio_to_median: float
    percentile_label: PercentileLabel
    source_url: str


class DashboardSummaryOut(BaseModel):
    wedding_date: date
    d_day: int
    total_budget: int
    total_paid: int
    total_planned: int
    remaining_budget: int
    budget_benchmark: DashboardBudgetBenchmarkOut | None
    categories: list[DashboardCategoryOut]
    upcoming_items: list[DashboardUpcomingItemOut]
