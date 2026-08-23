"""#18-23 — 03_API_spec.md §3-④⑤. 지출/납부(payments), 참가격 벤치마크.

payments는 2026-08-24부로 app/services/payment.py를 통한 실DB 조회로 전환했다(별도 태스크,
app/services/wedding.py의 paid_amount/BUDGET_BELOW_PAID TODO를 여는 선행 작업). `/benchmarks/
compare`는 인증/weddings/price_benchmarks가 모두 갖춰져 마찬가지로 실DB 조회로 전환했다 —
has_benchmark 판단은 app/routers/_mock.py의 구 7개짜리 MOCK_CATEGORIES가 아니라
app/core/categories.py의 CATEGORY_META_BY_CODE(9개, 단일 소스)를 조회한다.

v3.0의 `/checklists/*`(#8-9) 목 엔드포인트는 v4.0에서 완전히 다른 리소스명·구조(`/checklist-items`,
app/routers/checklist.py, 웨딩별 실DB 행)로 대체돼 여기서 제거했다 — v4.0 API 명세서에
`/checklists/*` 자체가 없다."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.categories import CATEGORY_META_BY_CODE
from app.core.db import get_session
from app.core.errors import api_error
from app.deps import get_current_wedding
from app.models import Payment, Wedding
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
from app.services.payment import compute_d_day
from app.services.payment import create_payment as create_payment_service
from app.services.payment import delete_payment as delete_payment_service
from app.services.payment import get_payment as get_payment_service
from app.services.payment import list_payments as list_payments_service
from app.services.payment import list_upcoming_payments as list_upcoming_payments_service
from app.services.payment import update_payment as update_payment_service

router = APIRouter(tags=["budget"])


def _to_out(payment: Payment) -> PaymentOut:
    return PaymentOut(
        id=payment.id,
        category_code=payment.category_code,
        item_name=payment.item_name,
        payment_type=payment.payment_type,
        vendor_name=payment.vendor_name,
        contact_name=payment.contact_name,
        contact_phone=payment.contact_phone,
        amount=payment.amount,
        due_date=payment.due_date,
        paid_date=payment.paid_date,
        status=payment.status,
        receipt_url=payment.receipt_url,
        memo=payment.memo,
    )


@router.get("/payments", response_model=PaymentListOut)
async def list_payments(
    category_code: str | None = None,
    status: str | None = None,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> PaymentListOut:
    if category_code is not None and category_code not in CATEGORY_META_BY_CODE:
        raise api_error(
            404, "CATEGORY_NOT_FOUND", f"{category_code}는 존재하지 않는 카테고리입니다."
        )
    rows = await list_payments_service(session, wedding.id, category_code, status)
    return PaymentListOut(payments=[_to_out(row) for row in rows])


@router.post("/payments", response_model=PaymentOut, status_code=201)
async def create_payment(
    payload: PaymentCreate,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> PaymentOut:
    if payload.category_code not in CATEGORY_META_BY_CODE:
        raise api_error(
            404, "CATEGORY_NOT_FOUND", f"{payload.category_code}는 존재하지 않는 카테고리입니다."
        )
    payment = await create_payment_service(session, wedding.id, payload)
    return _to_out(payment)


@router.patch("/payments/{payment_id}", response_model=PaymentOut)
async def update_payment(
    payment_id: str,
    payload: PaymentUpdate,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> PaymentOut:
    payment = await get_payment_service(session, wedding.id, payment_id)
    if payment is None:
        raise api_error(404, "PAYMENT_NOT_FOUND", "해당 납부 항목을 찾을 수 없습니다.")
    updated = await update_payment_service(session, payment, payload)
    return _to_out(updated)


@router.delete("/payments/{payment_id}", status_code=204)
async def delete_payment(
    payment_id: str,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> None:
    payment = await get_payment_service(session, wedding.id, payment_id)
    if payment is None:
        raise api_error(404, "PAYMENT_NOT_FOUND", "해당 납부 항목을 찾을 수 없습니다.")
    await delete_payment_service(session, payment)


@router.get("/payments/upcoming", response_model=UpcomingPaymentListOut)
async def list_upcoming_payments(
    days: int = 30,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> UpcomingPaymentListOut:
    today = datetime.now(UTC).date()
    rows = await list_upcoming_payments_service(session, wedding.id, days, today)
    return UpcomingPaymentListOut(
        days=days,
        payments=[
            UpcomingPaymentOut(
                id=row.id,
                category_code=row.category_code,
                item_name=row.item_name,
                amount=row.amount,
                due_date=row.due_date,
                d_day=compute_d_day(row.due_date, today),
            )
            for row in rows
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
