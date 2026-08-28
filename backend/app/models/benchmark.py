"""price_benchmarks / vendor_case_examples — 04_DB_spec.md §4-(9)(10), §7 DDL.

vendor_case_examples(F10)는 익명 재구성 사례 카드 — 실제 업체를 특정하는 값을 절대 담지 않는다
(06_RAG_implementation_and_copyright_review.md 참조). Importer: app/models/__init__.py."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    Integer,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class PriceBenchmark(Base):
    """참가격 통계. wedding_id 없음 — 결혼과 무관한 참고표.

    category_code는 다른 카테고리 참조 테이블과 달리 categories ENUM을 쓰지 않고 TEXT+CHECK로
    남겨둔다 — 'TOTAL'(F7 예산 미정 슬라이더 placeholder용 특수값)이 이 테이블에만 필요하고
    다른 곳엔 절대 허용되면 안 되기 때문(04_ERD.md, 11_v3_to_v4_diff.md §1-5)."""

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
            "category_code IN "
            "('MEETING','VENUE','SDM','GIFT','HOMEWARE','INVITATION','HONEYMOON','HOMENEW','ETC','TOTAL')",
            name="ck_price_benchmarks_category_code",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    survey_month: Mapped[datetime] = mapped_column(Date, nullable=False)
    region_code: Mapped[str] = mapped_column(Text, nullable=False)
    category_code: Mapped[str] = mapped_column(Text, nullable=False)
    item_code: Mapped[str] = mapped_column(Text, nullable=False, server_default="TOTAL")
    median_price: Mapped[int] = mapped_column(BigInteger, nullable=False)
    min_price: Mapped[int | None] = mapped_column(BigInteger)
    max_price: Mapped[int | None] = mapped_column(BigInteger)
    sample_count: Mapped[int | None] = mapped_column(Integer)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    source_note: Mapped[str | None] = mapped_column(Text)


class VendorCaseExample(Base):
    """[F10] 업체 사례(좋은 예/나쁜 예). 익명 합성 패턴만 — 실명/주소/연락처 금지.

    category_code는 category_code ENUM 타입을 쓰지 않고 TEXT+CHECK로 남겨둔다(PriceBenchmark와
    동일 이유는 아님) — F10은 카테고리 개수·ENUM 상태와 무관하게 VENUE/SDM 2개로 고정된 규칙
    (06_RAG_implementation_and_copyright_review.md §3: "F10은 VENUE/SDM에만 적용, 카테고리 개수
    변경과 무관")이라, 이 테이블이 category_code ENUM 재설계(다른 세션 진행 중)와 아예 독립적으로
    존재할 수 있게 하기 위한 선택이다."""

    __tablename__ = "vendor_case_examples"
    __table_args__ = (
        CheckConstraint(
            "category_code IN ('VENUE','SDM')", name="ck_vendor_case_examples_category_code"
        ),
        CheckConstraint("case_type IN ('GOOD','BAD')", name="ck_vendor_case_examples_case_type"),
        CheckConstraint(
            "source_tier IN ('OFFICIAL','NEWS','INDUSTRY','CONSENSUS')",
            name="ck_vendor_case_examples_source_tier",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    category_code: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    case_type: Mapped[str] = mapped_column(Text, nullable=False)
    case_label: Mapped[str] = mapped_column(Text, nullable=False)
    situation: Mapped[str] = mapped_column(Text, nullable=False)
    key_lesson: Mapped[str] = mapped_column(Text, nullable=False)
    related_item_type: Mapped[str | None] = mapped_column(Text)
    source_tier: Mapped[str] = mapped_column(Text, nullable=False)
    source_note: Mapped[str | None] = mapped_column(Text)
    display_order: Mapped[int | None] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
