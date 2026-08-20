"""price_benchmarks / vendor_case_examples — 04_DB_spec.md §4-(9)(10), §7 DDL.

vendor_case_examples(F10)는 익명 재구성 사례 카드 — 실제 업체를 특정하는 값을 절대 담지 않는다
(06_RAG_implementation_and_copyright_review.md 참조). Importer: app/models/__init__.py."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class PriceBenchmark(Base):
    """참가격 통계(예식장·스드메 전용). wedding_id 없음 — 결혼과 무관한 참고표."""

    __tablename__ = "price_benchmarks"
    __table_args__ = (
        UniqueConstraint(
            "survey_month",
            "region_code",
            "category_code",
            "item_code",
            name="uq_price_benchmarks_month_region_cat_item",
        ),
        CheckConstraint(
            "category_code IN ('VENUE','SDM')", name="ck_price_benchmarks_category_code"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    survey_month: Mapped[datetime] = mapped_column(Date, nullable=False)
    region_code: Mapped[str] = mapped_column(Text, nullable=False)
    category_code: Mapped[str] = mapped_column(Text, nullable=False)
    item_code: Mapped[str] = mapped_column(Text, nullable=False)
    median_price: Mapped[int] = mapped_column(BigInteger, nullable=False)
    min_price: Mapped[int | None] = mapped_column(BigInteger)
    max_price: Mapped[int | None] = mapped_column(BigInteger)
    sample_count: Mapped[int | None] = mapped_column(Integer)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)


class VendorCaseExample(Base):
    """[F10] 업체 사례(좋은 예/나쁜 예). 익명 합성 패턴만 — 실명/주소/연락처 금지."""

    __tablename__ = "vendor_case_examples"
    __table_args__ = (
        CheckConstraint("case_type IN ('GOOD','BAD')", name="ck_vendor_case_examples_case_type"),
        CheckConstraint(
            "source_tier IN ('OFFICIAL','NEWS','INDUSTRY','CONSENSUS')",
            name="ck_vendor_case_examples_source_tier",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    category_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("categories.id"), nullable=False, index=True
    )
    case_type: Mapped[str] = mapped_column(Text, nullable=False)
    case_label: Mapped[str] = mapped_column(Text, nullable=False)
    situation: Mapped[str] = mapped_column(Text, nullable=False)
    key_lesson: Mapped[str] = mapped_column(Text, nullable=False)
    related_item_type: Mapped[str | None] = mapped_column(Text)
    source_tier: Mapped[str] = mapped_column(Text, nullable=False)
    source_note: Mapped[str | None] = mapped_column(Text)
    display_order: Mapped[int | None] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
