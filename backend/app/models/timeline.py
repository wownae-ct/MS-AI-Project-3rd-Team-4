"""timeline_items — 04_DB_schema.sql §E, BASELINE v4.0. 날짜를 가지는 건 이 테이블뿐 —
checklist_items와 완전히 독립(11_v3_to_v4_diff.md §1-3).

구 milestone_templates(55행 마스터, DB 테이블)는 백엔드 시드 상수(app/core/timeline_catalog.py)로
옮겨졌다 — 온보딩 시 이 상수를 wedding_date 기준으로 역산해 이 테이블에 직접 행을 생성한다
(app/services/timeline.py). phase_label(구 "D-11M" 라벨)은 컬럼으로 저장하지 않는다 — 프론트가
default_dday_offset_days로 공식 계산한다(2026-08-23 세션 결정).

Importer: app/models/__init__.py."""

from datetime import date, datetime
from uuid import UUID as UUIDType
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base
from app.models.wedding import CategoryCodeEnum


class TimelineItem(Base):
    __tablename__ = "timeline_items"
    __table_args__ = (
        CheckConstraint(
            "origin IN ('LLM','USER','CATALOG_FALLBACK')", name="ck_timeline_items_origin"
        ),
        CheckConstraint("status IN ('TODO','DONE')", name="ck_timeline_items_status"),
    )

    id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    wedding_id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("weddings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_code: Mapped[str | None] = mapped_column(CategoryCodeEnum)
    generated_by_run_id: Mapped[UUIDType | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai_invocations.id")
    )
    origin: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="TODO")
    title: Mapped[str] = mapped_column(Text, nullable=False)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    default_dday_offset_days: Mapped[int | None] = mapped_column(Integer)
    date_overridden: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # DDL은 TIMESTAMPTZ다 — DateTime(timezone=True) 명시 이유는 app/models/checklist.py의
    # user_edited_at 주석 참고(같은 asyncpg 바인딩 문제).
    user_edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    display_order: Mapped[int | None] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
