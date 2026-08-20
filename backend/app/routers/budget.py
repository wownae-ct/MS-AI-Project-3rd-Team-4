"""#8-15 — 03_API_spec.md §3. 체크리스트, 지출/납부(payments), 참가격 벤치마크.

09_backend_implementation_plan.md Phase 1 범위 — 전부 목 응답. #15만은 has_benchmark 플래그
조회로 MOCKUP 카테고리에 404를 내려주는 실제 분기 로직을 포함한다(API 명세서 §5 원칙 — 목
단계에서도 카테고리별 하드코딩 분기 대신 플래그 조회 패턴을 그대로 따른다)."""

from datetime import UTC, date, datetime
from uuid import UUID

from fastapi import APIRouter

from app.core.errors import api_error
from app.routers._mock import MOCK_CATEGORIES
from app.schemas.benchmark import BenchmarkCompareOut, PercentileLabel
from app.schemas.checklist import (
    ChecklistItemOut,
    ChecklistListOut,
    ChecklistProgressUpdate,
    ChecklistProgressUpdateOut,
)
from app.schemas.payment import (
    PaymentCreate,
    PaymentListOut,
    PaymentOut,
    PaymentUpdate,
    UpcomingPaymentListOut,
    UpcomingPaymentOut,
)

router = APIRouter(tags=["budget"])

_HAS_BENCHMARK_BY_CODE = {row[1]: row[6] for row in MOCK_CATEGORIES}

_MOCK_CHECKLIST_ITEMS = [
    ChecklistItemOut(
        id=101,
        item_type="CONTRACT_TERM",
        option_group=None,
        title="위약금이 총 대행요금의 10%를 넘지 않는지 계약서에 명시돼 있는지 확인하세요",
        body=(
            "소비자분쟁해결기준상 위약금은 총 대행요금의 10% 이하가 원칙입니다. 계약서에 이 비율이 "
            "명시돼 있는지, 서비스 개시 전/후 기준이 다른지 확인하세요."
        ),
        source_tier="OFFICIAL",
        source_label="공정위 표준계약서",
        source_url="https://www.korea.kr/briefing/pressReleaseView.do?newsId=156682367",
        default_dday_offset=-300,
        progress={"status": "TODO", "memo": None},
    ),
    ChecklistItemOut(
        id=102,
        item_type="EXTRA_COST",
        option_group=None,
        title="견적서에 없는 항목이 계약 후 추가금으로 청구되지 않는지 확인하세요",
        body="계약 전 견적서와 실제 청구서를 비교해, 옵션 표시가 없던 항목이 필수 추가금으로 바뀌는지 확인하세요.",
        source_tier="CONSENSUS",
        source_label="소비자 후기 종합",
        source_url=None,
        default_dday_offset=-180,
        progress={"status": "TODO", "memo": None},
    ),
]

_MOCK_PAYMENT_ID = UUID("c1a2b3c4-0000-4000-8000-000000000001")
_MOCK_NEW_PAYMENT_ID = UUID("c1a2b3c4-0000-4000-8000-000000000002")
_MOCK_UPCOMING_PAYMENT_ID = UUID("c1a2b3c4-0000-4000-8000-000000000003")

_MOCK_PAYMENT = PaymentOut(
    id=_MOCK_PAYMENT_ID,
    category_code="VENUE",
    item_name="○○컨벤션 대관료",
    payment_type="DEPOSIT",
    amount=3_000_000,
    due_date=date(2026, 9, 1),
    paid_date=None,
    status="PLANNED",
    vendor_name=None,
    memo=None,
)


@router.get("/checklists/{category_code}", response_model=ChecklistListOut)
async def list_checklist_items(
    category_code: str, item_type: str | None = None
) -> ChecklistListOut:
    items = _MOCK_CHECKLIST_ITEMS
    if item_type is not None:
        items = [item for item in items if item.item_type == item_type]
    return ChecklistListOut(category_code=category_code, items=items)


@router.put("/checklists/items/{item_id}/progress", response_model=ChecklistProgressUpdateOut)
async def update_checklist_progress(
    item_id: int, payload: ChecklistProgressUpdate
) -> ChecklistProgressUpdateOut:
    return ChecklistProgressUpdateOut(
        checklist_item_id=item_id,
        status=payload.status,
        memo=payload.memo,
        updated_at=datetime.now(UTC),
    )


@router.get("/payments", response_model=PaymentListOut)
async def list_payments(
    category_code: str | None = None, status: str | None = None
) -> PaymentListOut:
    payments = [_MOCK_PAYMENT]
    if category_code is not None:
        payments = [p for p in payments if p.category_code == category_code]
    if status is not None:
        payments = [p for p in payments if p.status == status]
    return PaymentListOut(payments=payments)


@router.post("/payments", response_model=PaymentOut, status_code=201)
async def create_payment(payload: PaymentCreate) -> PaymentOut:
    return PaymentOut(
        id=_MOCK_NEW_PAYMENT_ID,
        category_code=payload.category_code,
        item_name=payload.item_name,
        payment_type=payload.payment_type,
        amount=payload.amount,
        due_date=payload.due_date,
        paid_date=None,
        status="PLANNED",
        vendor_name=None,
        memo=None,
    )


@router.patch("/payments/{payment_id}", response_model=PaymentOut)
async def update_payment(payment_id: str, payload: PaymentUpdate) -> PaymentOut:
    return _MOCK_PAYMENT.model_copy(update=payload.model_dump(exclude_unset=True))


@router.delete("/payments/{payment_id}", status_code=204)
async def delete_payment(payment_id: str) -> None:
    return None


@router.get("/payments/upcoming", response_model=UpcomingPaymentListOut)
async def list_upcoming_payments(days: int = 30) -> UpcomingPaymentListOut:
    return UpcomingPaymentListOut(
        days=days,
        payments=[
            UpcomingPaymentOut(
                id=_MOCK_UPCOMING_PAYMENT_ID,
                category_code="SDM",
                item_name="스튜디오 잔금",
                amount=800_000,
                due_date=date(2026, 8, 28),
                d_day=-8,
            )
        ],
    )


@router.get("/benchmarks/compare", response_model=BenchmarkCompareOut)
async def compare_benchmark(category_code: str, item_code: str, amount: int) -> BenchmarkCompareOut:
    if not _HAS_BENCHMARK_BY_CODE.get(category_code, False):
        raise api_error(
            404,
            "BENCHMARK_NOT_AVAILABLE",
            f"{category_code}는 참가격 벤치마크를 제공하지 않습니다.",
        )
    median_price = 3_000_000
    ratio = round(amount / median_price, 2)
    label: PercentileLabel = "낮음" if ratio < 0.9 else "높음" if ratio > 1.1 else "평균"
    return BenchmarkCompareOut(
        category_code=category_code,
        item_code=item_code,
        region_code="SEOUL_GANGNAM",
        survey_month=date(2026, 7, 1),
        your_amount=amount,
        median_price=median_price,
        min_price=2_100_000,
        max_price=4_800_000,
        sample_count=42,
        percentile_label=label,
        ratio_to_median=ratio,
        source_url="https://www.price.go.kr/tprice/portal/wedding/areaCompare.do",
    )
