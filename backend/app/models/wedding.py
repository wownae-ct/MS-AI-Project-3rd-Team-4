"""weddings / wedding_categories — 04_DB_schema.sql, BASELINE v4.0 ①②(인증+카테고리 ENUM).

Importer: app/models/__init__.py. v3.0 대비: Wedding에 owner_user_id(로그인 사용자 1:1) 추가,
WeddingCategory.category_id FK가 category_code ENUM 컬럼으로 바뀌어 categories 테이블 자체가
없어졌다(카테고리 목록은 이제 app/core/categories.py의 백엔드 상수)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ENUM as PGEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base

# Alembic 마이그레이션(63c0e2ae03d4)이 이미 `CREATE TYPE category_code AS ENUM (...)`을 직접
# 실행하므로, 여기서는 create_type=False로 "이미 있는 타입을 재사용"만 선언한다 — SQLAlchemy가
# 또 CREATE TYPE을 시도하면 중복 생성 에러가 난다.
CategoryCodeEnum = PGEnum(
    "MEETING",
    "VENUE",
    "SDM",
    "GIFT",
    "HOMEWARE",
    "INVITATION",
    "HONEYMOON",
    "HOMENEW",
    "ETC",
    name="category_code",
    create_type=False,
)


class Wedding(Base):
    """로그인 사용자당 정확히 1행(owner_user_id UNIQUE로 DB가 강제) — v3.0의 "시드된 단일 행"
    가정을 폐기하고 진짜 다중 사용자 모델이 됐다."""

    __tablename__ = "weddings"
    __table_args__ = (
        CheckConstraint("total_budget > 0", name="ck_weddings_total_budget"),
        CheckConstraint("user_role IN ('BRIDE','GROOM')", name="ck_weddings_user_role"),
        CheckConstraint(
            "wedding_date_precision IN "
            "('EXACT','APPROX_H2_THIS_YEAR','APPROX_H1_NEXT_YEAR','APPROX_H2_NEXT_YEAR','NO_PLAN')",
            name="ck_weddings_date_precision",
        ),
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
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    user_role: Mapped[str] = mapped_column(Text, nullable=False)
    wedding_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    wedding_date_precision: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="EXACT"
    )
    total_budget: Mapped[int] = mapped_column(BigInteger, nullable=False)
    total_budget_unsure: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    region_code: Mapped[str] = mapped_column(Text, nullable=False)
    guest_count_unsure: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    guest_count: Mapped[int | None]
    taste_preference: Mapped[str | None] = mapped_column(Text)
    venue_priority: Mapped[str | None] = mapped_column(Text)
    sdm_priority: Mapped[str | None] = mapped_column(Text)
    primary_goals: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    priorities: Mapped[dict | None] = mapped_column(JSONB)
    # done_so_far: 온보딩 요청의 "지금까지 진행한 것" 신호는 timeline_items 초기 상태에 1회성으로만
    # 반영되고 저장되지 않는다(03_API_spec.md #6) — 이 컬럼은 그것과 별개로, 화면에 보여줄 캐시
    # 용도로만 쓰이는 자리다(04_DB_schema.sql). timeline_items가 아직 없어(별도 태스크) 지금은
    # 아무도 쓰지 않는다 — TODO(timeline-task): timeline_items 생성 시 이 컬럼 갱신 로직 추가.
    done_so_far: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class WeddingCategory(Base):
    """카테고리 On/Off + 배정 예산. SUM(planned_budget, 9개 전체) <= weddings.total_budget는
    서비스 코드에서 검증(04_DB_schema.sql 검증 순서 그대로)."""

    __tablename__ = "wedding_categories"
    __table_args__ = (
        UniqueConstraint(
            "wedding_id", "category_code", name="uq_wedding_categories_wedding_category"
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
    category_code: Mapped[str] = mapped_column(CategoryCodeEnum, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    planned_budget: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    selected_options: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    skip_reason: Mapped[str | None] = mapped_column(Text)
    display_order: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Category(Base):
    """[DEPRECATED — v3.0 잔재] 원래 테이블(categories)은 7713273146d1로 이미 삭제됐고
    v4.0에서는 category_code ENUM + app/core/categories.py 백엔드 상수로 대체됐다(위
    WeddingCategory가 그 새 방식을 씀). 이 클래스는 아직 v4.0으로 재구현되지 않은
    app/services/chat.py가 참조하고 있어서만 남겨뒀다 — 새 코드에서는 쓰지 말 것.
    chat_sessions/chat_messages를 v4.0으로 재구현하는 별도 태스크에서 chat.py와 함께 정리
    (app/core/categories.py의 CATEGORY_META로 교체)하고 이 클래스도 지울 것."""

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
