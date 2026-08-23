"""#18-23 — 03_API_spec.md §3-④⑤. 지출/납부(payments), 참가격 벤치마크.

09_backend_implementation_plan.md Phase 1 범위 — payments는 아직 목 응답(별도 태스크,
app/services/wedding.py의 TODO(payments-task) 참고). `/benchmarks/compare`는 인증/weddings/
price_benchmarks가 모두 갖춰져 2026-08-24부로 app/services/benchmark.py를 통한 실DB 조회로
전환했다 — has_benchmark 판단은 app/routers/_mock.py의 구 7개짜리 MOCK_CATEGORIES가 아니라
app/core/categories.py의 CATEGORY_META_BY_CODE(9개, 단일 소스)를 조회한다.

v3.0의 `/checklists/*`(#8-9) 목 엔드포인트는 v4.0에서 완전히 다른 리소스명·구조(`/checklist-items`,
app/routers/checklist.py, 웨딩별 실DB 행)로 대체돼 여기서 제거했다 — v4.0 API 명세서에
`/checklists/*` 자체가 없다."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.categories import CATEGORY_META_BY_CODE
from app.core.db import get_session
from app.core.errors import api_error
from app.deps import get_current_wedding
from app.models import Wedding
from app.schemas.benchmark import BenchmarkCompareOut
from app.schemas.payment import (
    PaymentCreate,
    PaymentListOut,
    PaymentOut,
    PaymentUpdate,
    UpcomingPaymentListOut,
    UpcomingPaymentOut,
)
from app.services.benchmark import compute_ratio_and_label, get_latest_benchmark

router = APIRouter(tags=["budget"])

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
async def compare_benchmark(
    category_code: str,
    item_code: str,
    amount: int,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> BenchmarkCompareOut:
    category_meta = CATEGORY_META_BY_CODE.get(category_code)
    if category_meta is None or not category_meta.has_benchmark:
        raise api_error(
            404,
            "BENCHMARK_NOT_AVAILABLE",
            f"{category_code}는 참가격 벤치마크를 제공하지 않습니다.",
        )
    benchmark = await get_latest_benchmark(session, wedding.region_code, category_code, item_code)
    if benchmark is None:
        raise api_error(
            404,
            "BENCHMARK_NOT_AVAILABLE",
            f"{wedding.region_code}/{category_code}/{item_code}의 참가격 데이터가 없습니다.",
        )
    ratio, label = compute_ratio_and_label(amount, benchmark.median_price)
    return BenchmarkCompareOut(
        category_code=category_code,
        item_code=item_code,
        region_code=benchmark.region_code,
        survey_month=benchmark.survey_month,
        your_amount=amount,
        median_price=benchmark.median_price,
        min_price=benchmark.min_price,
        max_price=benchmark.max_price,
        sample_count=benchmark.sample_count,
        percentile_label=label,
        ratio_to_median=ratio,
        source_url=benchmark.source_url,
    )
