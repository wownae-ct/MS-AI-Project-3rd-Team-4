"""checklist_items / checklist_progress — 04_DB_spec.md §4-(4)(5), §7 DDL.

Importer: app/models/__init__.py. Plan §3 스켈레톤 재구성 작업의 일부."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Integer,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class ChecklistItem(Base):
    """ "계약 전 확인하세요" 항목 마스터. 배포 시 시드(~85행), 사용자는 못 바꾼다."""

    __tablename__ = "checklist_items"
    __table_args__ = (
        CheckConstraint(
            "item_type IN ('CONTRACT_TERM','EXTRA_COST','PREP')",
            name="ck_checklist_items_item_type",
        ),
        CheckConstraint(
            "source_tier IN ('OFFICIAL','NEWS','INDUSTRY','CONSENSUS')",
            name="ck_checklist_items_source_tier",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    category_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("categories.id"), nullable=False, index=True
    )
    item_type: Mapped[str] = mapped_column(Text, nullable=False)
    option_group: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    source_tier: Mapped[str] = mapped_column(Text, nullable=False)
    source_label: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text)
    default_dday_offset: Mapped[int | None] = mapped_column(Integer)
    display_order: Mapped[int | None] = mapped_column(SmallInteger)


class ChecklistProgress(Base):
    """사용자가 체크한 상태. upsert 대상이라 (wedding_id, checklist_item_id) UNIQUE."""

    __tablename__ = "checklist_progress"
    __table_args__ = (
        UniqueConstraint(
            "wedding_id", "checklist_item_id", name="uq_checklist_progress_wedding_item"
        ),
        CheckConstraint(
            "status IN ('TODO','DOING','DONE','SKIP')", name="ck_checklist_progress_status"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    wedding_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("weddings.id", ondelete="CASCADE"), nullable=False
    )
    checklist_item_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("checklist_items.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="TODO")
    memo: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())
