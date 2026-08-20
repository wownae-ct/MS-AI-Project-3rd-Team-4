"""weddings / categories / wedding_categories — 04_DB_spec.md §4-(1)(2)(3), §7 DDL.

Importer: app/models/__init__.py (re-exports Wedding/Category/WeddingCategory for
alembic autogenerate and, later, routers/services). No data files touched — pure ORM
mapping. User's instruction: 웨딩레이더 피벗 스켈레톤 재구성(plan §3), DDL 1:1 반영."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class Wedding(Base):
    """인증이 없으므로 이 표에는 항상 딱 1행만 있다(서비스 코드로 강제, DB CHECK 아님).

    wedding_date_precision부터 sdm_priority까지 5개 컬럼은 2026-08-21 온보딩 개인화 스코프
    확장분(04_DB_spec.md §4-(1) "2026-08-21 추가" 참고) — 최초 스캐폴딩 당시엔 없었다."""

    __tablename__ = "weddings"
    __table_args__ = (
        CheckConstraint("total_budget > 0", name="ck_weddings_total_budget"),
        CheckConstraint(
            "wedding_date_precision IN "
            "('EXACT','APPROX_H2_THIS_YEAR','APPROX_H1_NEXT_YEAR','APPROX_H2_NEXT_YEAR','NO_PLAN')",
            name="ck_weddings_date_precision",
        ),
        CheckConstraint("user_role IN ('BRIDE','GROOM')", name="ck_weddings_user_role"),
        CheckConstraint(
            "taste_preference IN ('MINIMAL','BUDGET','GRAND','BALANCED')",
            name="ck_weddings_taste_preference",
        ),
        CheckConstraint(
            "venue_priority IN ('FOOD','LOCATION','PARKING','CAPACITY')",
            name="ck_weddings_venue_priority",
        ),
        CheckConstraint(
            "sdm_priority IN ('DRESS','PHOTO','MAKEUP')", name="ck_weddings_sdm_priority"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    wedding_date: Mapped[date] = mapped_column(Date, nullable=False)
    wedding_date_precision: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="EXACT"
    )
    total_budget: Mapped[int] = mapped_column(BigInteger, nullable=False)
    region_code: Mapped[str] = mapped_column(Text, nullable=False)
    guest_count: Mapped[int | None]
    user_role: Mapped[str] = mapped_column(Text, nullable=False)
    taste_preference: Mapped[str | None] = mapped_column(Text)
    venue_priority: Mapped[str | None] = mapped_column(Text)
    sdm_priority: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Category(Base):
    """7개 카테고리 마스터. 배포 시 시드 1회, 이후 불변."""

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    code: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    name_ko: Mapped[str] = mapped_column(Text, nullable=False)
    display_order: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    tier: Mapped[str] = mapped_column(
        String, CheckConstraint("tier IN ('FOCUS','MOCKUP')"), nullable=False
    )
    has_cost: Mapped[bool] = mapped_column(Boolean, nullable=False)
    has_benchmark: Mapped[bool] = mapped_column(Boolean, nullable=False)
    has_vendor_cases: Mapped[bool] = mapped_column(Boolean, nullable=False)


class WeddingCategory(Base):
    """카테고리 On/Off + 배정 예산. SUM(planned_budget) <= weddings.total_budget는 서비스 코드에서 검증."""

    __tablename__ = "wedding_categories"
    __table_args__ = (
        UniqueConstraint(
            "wedding_id", "category_id", name="uq_wedding_categories_wedding_category"
        ),
        CheckConstraint("planned_budget >= 0", name="ck_wedding_categories_planned_budget"),
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
    category_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("categories.id"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    planned_budget: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    skip_reason: Mapped[str | None] = mapped_column(Text)
    display_order: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
