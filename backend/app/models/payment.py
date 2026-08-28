"""payments — 04_DB_spec.md §4-⑥(8). 지출/납부예정 통합(status로만 구분).

v3.0 잔재였던 구버전(category_id → 이미 드롭된 categories 테이블 FK)을 eac99fa785c5가 재작성한
v4.0 shape에 맞춘다 — category_code는 63c0e2ae03d4가 만든 category_code ENUM 재사용.
contact_name/contact_phone/receipt_url 3개는 [프로토타입 반영] 컬럼.

Importer: app/models/__init__.py."""

import uuid
from datetime import date

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base
from app.models.wedding import CategoryCodeEnum


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_payments_amount"),
        CheckConstraint(
            "payment_type IN ('DEPOSIT','INTERIM','BALANCE','ETC')", name="ck_payments_payment_type"
        ),
        CheckConstraint("status IN ('PLANNED','PAID','CANCELED')", name="ck_payments_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    wedding_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("weddings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_code: Mapped[str] = mapped_column(CategoryCodeEnum, nullable=False)
    item_name: Mapped[str] = mapped_column(Text, nullable=False)
    payment_type: Mapped[str] = mapped_column(Text, nullable=False)
    vendor_name: Mapped[str | None] = mapped_column(Text)
    contact_name: Mapped[str | None] = mapped_column(Text)
    contact_phone: Mapped[str | None] = mapped_column(Text)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    paid_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="PLANNED")
    receipt_url: Mapped[str | None] = mapped_column(Text)
    memo: Mapped[str | None] = mapped_column(Text)
