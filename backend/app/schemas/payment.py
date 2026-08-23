"""#18-21 — 03_API_spec.md §3-④. 지출 기록 + 납부 예정일(payments 통합 테이블).

contact_name/contact_phone/receipt_url 3개는 [프로토타입 반영] 컬럼(04_DB_spec.md §4-⑥) —
계약 분쟁 시 실무상 필요, 영수증은 파일 업로드 대신 URL 입력."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import CategoryCode, PaymentStatus, PaymentType


class PaymentOut(BaseModel):
    id: UUID
    category_code: CategoryCode
    item_name: str
    payment_type: PaymentType
    vendor_name: str | None
    contact_name: str | None
    contact_phone: str | None
    amount: int
    due_date: date | None
    paid_date: date | None
    status: PaymentStatus
    receipt_url: str | None
    memo: str | None


class PaymentListOut(BaseModel):
    payments: list[PaymentOut]


class PaymentCreate(BaseModel):
    category_code: CategoryCode
    item_name: str
    payment_type: PaymentType
    vendor_name: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    amount: int = Field(gt=0)
    due_date: date | None = None


class PaymentUpdate(BaseModel):
    """부분 수정 — 보낸 필드만 갱신(app/services/wedding.py의 WeddingUpdate와 동일 원칙).
    03_API_spec.md #20 예시는 납부 완료 처리(status/paid_date/receipt_url)만 보이지만, 다른
    필드도 PATCH로 정정 가능해야 해서(예: 금액 오기입) 전체 컬럼을 optional로 연다."""

    category_code: CategoryCode | None = None
    item_name: str | None = None
    payment_type: PaymentType | None = None
    vendor_name: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    amount: int | None = Field(default=None, gt=0)
    due_date: date | None = None
    paid_date: date | None = None
    status: PaymentStatus | None = None
    receipt_url: str | None = None
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
