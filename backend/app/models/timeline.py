"""milestone_templates / user_milestones — 04_DB_spec.md §4-(7)(8), §7 DDL. 마스터/사용자본 분리(§5-b).

Importer: app/models/__init__.py."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    SmallInteger,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class MilestoneTemplate(Base):
    """표준 타임라인 마스터(D-day offset 기준, ~55행 시드). 배포 후 불변."""

    __tablename__ = "milestone_templates"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    category_id: Mapped[int | None] = mapped_column(SmallInteger, ForeignKey("categories.id"))
    title: Mapped[str] = mapped_column(Text, nullable=False)
    dday_offset_days: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    phase_label: Mapped[str] = mapped_column(Text, nullable=False)
    display_order: Mapped[int | None] = mapped_column(SmallInteger)


class UserMilestone(Base):
    """온보딩 시 템플릿을 (본식일 + offset)으로 복사한 이 결혼의 실제 타임라인."""

    __tablename__ = "user_milestones"
    __table_args__ = (
        CheckConstraint("status IN ('TODO','DONE')", name="ck_user_milestones_status"),
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
    template_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("milestone_templates.id")
    )
    category_id: Mapped[int | None] = mapped_column(SmallInteger, ForeignKey("categories.id"))
    title: Mapped[str] = mapped_column(Text, nullable=False)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="TODO")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())
