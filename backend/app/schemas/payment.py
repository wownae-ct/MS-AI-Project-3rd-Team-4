"""#18-21 — 03_API_spec.md §3-④. 지출 기록 + 납부 예정일(payments 통합 테이블).

contact_name/contact_phone/receipt_url 3개는 [프로토타입 반영] 컬럼(04_DB_spec.md §4-⑥) —
계약 분쟁 시 실무상 필요. receipt_url은 v4.0 최초 설계 당시 "파일 업로드 대신 URL 입력"이었으나,
2026-08-25 영수증 OCR 자동채움 결정(docs/AI-Sessions/wiki/decisions/
2026-08-25-receipt-ocr-payment-autofill-decision.md)으로 그 판단이 뒤집혔다 — 이제
"백엔드가 POST /payments/receipt-extract에서 Blob에 업로드한 뒤 반환하는 URL"이다. 컬럼 자체
(TEXT)는 재사용, 값의 출처만 바뀌었다."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

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
    # 영수증 OCR 자동채움(2026-08-25 결정) — 영수증은 "이미 결제 완료" 증빙이라 생성 시점에
    # paid_date를 받을 수 있어야 한다. status는 별도 필드로 안 열고 app/services/payment.py::
    # create_payment()가 paid_date 유무로 자동 유도한다(클라이언트가 생성 시점에 CANCELED
    # 같은 임의 상태를 넣을 수 있게 API 표면을 넓히지 않기 위함).
    paid_date: date | None = None
    receipt_url: str | None = None


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

    @model_validator(mode="after")
    def _reject_planned_with_paid_date(self) -> "PaymentUpdate":
        """트러블슈팅 STEP 6(2026-08-26) — status="PLANNED"인데 paid_date가 채워지는 모순
        상태를 요청 단계에서 막는다. status를 안 보낸 경우(None)는 여기 안 걸린다 — 그 경우는
        app/services/payment.py::update_payment이 paid_date 유무로 PAID를 자동 유도한다
        (create_payment과 동일 원칙)."""
        if self.status == "PLANNED" and self.paid_date is not None:
            raise ValueError("status가 PLANNED면 paid_date를 함께 보낼 수 없습니다.")
        return self


class ReceiptExtractOut(BaseModel):
    """POST /payments/receipt-extract 응답 — 2026-08-25 영수증 OCR 자동채움 결정. DB 반영
    없음(추출만), 프론트가 이 값으로 폼을 프리필하고 사용자가 확인/수정한 뒤 PaymentCreate로
    POST /payments를 호출한다. category_code는 포함하지 않는다 — 상호명만으로 카테고리를
    신뢰할 수 없어 여전히 사용자가 직접 선택(결정 문서 참고). item_name/vendor_name/amount/
    paid_date는 LLM이 읽지 못했으면 null일 수 있다 — receipt_url만 항상 값이 있다(업로드는
    추출 성공 여부와 무관하게 항상 먼저 끝남)."""

    item_name: str | None
    vendor_name: str | None
    amount: int | None
    paid_date: date | None
    receipt_url: str


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
