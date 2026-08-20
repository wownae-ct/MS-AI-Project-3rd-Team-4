"""#17-19, #23 — 03_API_spec.md §3. 타임라인, 대시보드 요약, 마이 리포트.

09_backend_implementation_plan.md Phase 1 범위 — 전부 목 응답. d_day/is_overdue는 문서에 명시된
계산식(§3 #17, #19)을 그대로 적용해 date.today() 기준으로 매번 계산한다 — 목이라도 날짜 계산
로직 자체는 Phase 2에서 거의 그대로 재사용할 수 있게."""

from datetime import UTC, date, datetime
from uuid import UUID

from fastapi import APIRouter

from app.schemas.dashboard import DashboardCategoryOut, DashboardSummaryOut
from app.schemas.payment import UpcomingPaymentOut
from app.schemas.report import (
    BudgetSummaryOut,
    CategoryCompletionOut,
    RecommendedCheckOut,
    ReportOut,
)
from app.schemas.timeline import MilestoneOut, MilestoneUpdate, TimelineOut

router = APIRouter(tags=["dashboard"])

_MOCK_MILESTONE_ID = UUID("d1e2f3a4-0000-4000-8000-000000000001")
_MOCK_UPCOMING_PAYMENT_ID = UUID("c1a2b3c4-0000-4000-8000-000000000003")

_MOCK_MILESTONE_RAW = {
    "id": _MOCK_MILESTONE_ID,
    "category_code": "VENUE",
    "title": "예식장 투어 및 계약",
    "phase_label": "D-11M",
    "target_date": date(2026, 6, 15),
    "status": "DONE",
}


def _milestone_out(raw: dict) -> MilestoneOut:
    today = datetime.now(UTC).date()
    is_overdue = raw["status"] == "TODO" and raw["target_date"] < today
    return MilestoneOut(is_overdue=is_overdue, **raw)


def _mock_upcoming_payment() -> UpcomingPaymentOut:
    return UpcomingPaymentOut(
        id=_MOCK_UPCOMING_PAYMENT_ID,
        category_code="SDM",
        item_name="스튜디오 잔금",
        amount=800_000,
        due_date=date(2026, 8, 28),
        d_day=-8,
    )


@router.get("/timeline", response_model=TimelineOut)
async def list_timeline() -> TimelineOut:
    return TimelineOut(milestones=[_milestone_out(_MOCK_MILESTONE_RAW)])


@router.patch("/timeline/{milestone_id}", response_model=MilestoneOut)
async def update_milestone(milestone_id: str, payload: MilestoneUpdate) -> MilestoneOut:
    base = _milestone_out(_MOCK_MILESTONE_RAW)
    return base.model_copy(update=payload.model_dump(exclude_unset=True))


@router.get("/dashboard/summary", response_model=DashboardSummaryOut)
async def dashboard_summary() -> DashboardSummaryOut:
    wedding_date = date(2027, 5, 15)
    return DashboardSummaryOut(
        wedding_date=wedding_date,
        d_day=(datetime.now(UTC).date() - wedding_date).days,  # 03_API_spec.md #19: 음수=남은 일수
        total_budget=45_000_000,
        total_paid=8_300_000,
        total_planned=32_000_000,
        remaining_budget=12_700_000,
        categories=[
            DashboardCategoryOut(
                category_code="VENUE",
                name_ko="예식장",
                tier="FOCUS",
                is_active=True,
                planned_budget=18_000_000,
                paid_amount=3_000_000,
                progress_rate=0.42,
            )
        ],
        upcoming_payments=[_mock_upcoming_payment()],
    )


@router.get("/reports/me", response_model=ReportOut)
async def get_my_report() -> ReportOut:
    return ReportOut(
        budget_summary=BudgetSummaryOut(
            total_budget=45_000_000, total_paid=8_300_000, remaining_budget=36_700_000
        ),
        category_completion=[CategoryCompletionOut(category_code="VENUE", progress_rate=0.42)],
        upcoming_payments=[_mock_upcoming_payment()],
        next_recommended_checks=[
            RecommendedCheckOut(
                checklist_item_id=101,
                title="위약금이 총 대행요금의 10%를 넘지 않는지 계약서에 명시돼 있는지 확인하세요",
                default_dday_offset=-300,
            )
        ],
    )
