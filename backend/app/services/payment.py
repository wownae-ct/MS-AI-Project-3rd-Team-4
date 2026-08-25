"""payments — 04_DB_spec.md §4-⑥(8), 03_API_spec.md #18-22. 지출 기록 + 납부 예정일 CRUD.

get_paid_amounts_by_category는 BUDGET_BELOW_PAID(03_API_spec.md #10) 검증용 카테고리별 PAID
합계다. 04_DB_spec.md §4-②의 참고 쿼리는 wedding_categories LEFT JOIN payments 형태지만,
호출부(app/services/wedding.py)가 이미 wedding_categories 9행 전체를 들고 있어 payments만
집계해 돌려주고 결제 이력이 없는 카테고리는 호출부가 0으로 채우는 쪽이 조인 없이 동일한 결과를
낸다 — 그래서 여기선 GROUP BY만 한다.

list_upcoming_payments는 due_date 하한을 안 둔다 — 이미 기한이 지난 PLANNED 항목(연체)도
"다가오는 납부"에 포함시켜야 사용자가 놓친 걸 바로 알 수 있다(03_API_spec.md #22 예시의
d_day=-8도 음수, 즉 연체 케이스를 이 엔드포인트가 다루는 정상 범위로 보여준다)."""

from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Payment
from app.schemas.payment import PaymentCreate, PaymentUpdate


def compute_d_day(due_date: date, today: date) -> int:
    """03_API_spec.md #22: d_day = due_date - today(음수=연체, 양수=남은 일수)."""
    return (due_date - today).days


async def list_payments(
    session: AsyncSession,
    wedding_id: UUID,
    category_code: str | None = None,
    status: str | None = None,
) -> list[Payment]:
    stmt = select(Payment).where(Payment.wedding_id == wedding_id)
    if category_code is not None:
        stmt = stmt.where(Payment.category_code == category_code)
    if status is not None:
        stmt = stmt.where(Payment.status == status)
    stmt = stmt.order_by(Payment.due_date)
    return list((await session.execute(stmt)).scalars().all())


async def create_payment(
    session: AsyncSession, wedding_id: UUID, payload: PaymentCreate
) -> Payment:
    """payload.paid_date가 있으면 이미 결제 완료된 건이므로 status를 PAID로 자동 유도한다
    (2026-08-25 영수증 OCR 자동채움 결정) — Payment.status의 server_default는 "PLANNED"라,
    paid_date만 채우고 status를 그대로 두면 "결제일은 있는데 상태는 예정"인 모순이 생긴다."""
    fields = payload.model_dump()
    if fields.get("paid_date") is not None:
        fields["status"] = "PAID"
    payment = Payment(wedding_id=wedding_id, **fields)
    session.add(payment)
    await session.commit()
    await session.refresh(payment)
    return payment


async def get_payment(session: AsyncSession, wedding_id: UUID, payment_id: str) -> Payment | None:
    stmt = select(Payment).where(Payment.id == payment_id, Payment.wedding_id == wedding_id)
    return (await session.execute(stmt)).scalar_one_or_none()


async def update_payment(
    session: AsyncSession, payment: Payment, payload: PaymentUpdate
) -> Payment:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(payment, field, value)
    await session.commit()
    await session.refresh(payment)
    return payment


async def delete_payment(session: AsyncSession, payment: Payment) -> None:
    await session.delete(payment)
    await session.commit()


async def list_upcoming_payments(
    session: AsyncSession, wedding_id: UUID, days: int, today: date
) -> list[Payment]:
    horizon = today + timedelta(days=days)
    stmt = (
        select(Payment)
        .where(
            Payment.wedding_id == wedding_id,
            Payment.status == "PLANNED",
            Payment.due_date.is_not(None),
            Payment.due_date <= horizon,
        )
        .order_by(Payment.due_date)
    )
    return list((await session.execute(stmt)).scalars().all())


async def get_paid_amounts_by_category(session: AsyncSession, wedding_id: UUID) -> dict[str, int]:
    stmt = (
        select(Payment.category_code, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.wedding_id == wedding_id, Payment.status == "PAID")
        .group_by(Payment.category_code)
    )
    return {code: int(total) for code, total in (await session.execute(stmt)).all()}
