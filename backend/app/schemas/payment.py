"""#10-14 — 03_API_spec.md §3. 지출 기록 + 납부 예정일(payments 통합 테이블)."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import CategoryCode, PaymentStatus, PaymentType


class PaymentOut(BaseModel):
    id: UUID
    category_code: CategoryCode
    item_name: str
    payment_type: PaymentType
    amount: int
    due_date: date | None
    paid_date: date | None
    status: PaymentStatus
    vendor_name: str | None
    memo: str | None


class PaymentListOut(BaseModel):
    payments: list[PaymentOut]


class PaymentCreate(BaseModel):
    category_code: CategoryCode
    item_name: str
    payment_type: PaymentType
    amount: int = Field(gt=0)
    due_date: date | None = None


class PaymentUpdate(BaseModel):
    status: PaymentStatus | None = None
    paid_date: date | None = None
    amount: int | None = Field(default=None, gt=0)
    due_date: date | None = None
    vendor_name: str | None = None
    memo: str | None = None


class UpcomingPaymentOut(BaseModel):
    id: UUID
    category_code: CategoryCode
    item_name: str
    amount: int
    due_date: date
    d_day: int


class UpcomingPaymentListOut(BaseModel):
    days: int
    payments: list[UpcomingPaymentOut]
