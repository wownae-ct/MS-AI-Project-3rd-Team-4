"""feedback_reports — 04_DB_spec.md §4-⑮. F13, 책임있는 AI "책임성"/"신뢰성 및 안전성" 원칙 대응.

target_id는 의도적으로 ForeignKey가 아니다 — target_type(CHAT_MESSAGE/CHECKLIST_ITEM/
TIMELINE_ITEM)에 따라 가리키는 테이블이 다른 다형 참조라 단일 FK로 표현할 수 없다. 존재+소유권
확인은 app/services/feedback.py가 target_type에 맞는 테이블에서 직접 한다.

Importer: app/models/__init__.py."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class FeedbackReport(Base):
    __tablename__ = "feedback_reports"
    __table_args__ = (
        CheckConstraint(
            "target_type IN ('CHAT_MESSAGE','CHECKLIST_ITEM','TIMELINE_ITEM')",
            name="ck_feedback_reports_target_type",
        ),
        CheckConstraint(
            "reason_category IN ('부정확함','부적절함','도움안됨','편향/차별적','기타')",
            name="ck_feedback_reports_reason_category",
        ),
        CheckConstraint(
            "status IN ('OPEN','REVIEWED','RESOLVED')", name="ck_feedback_reports_status"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    wedding_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("weddings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_type: Mapped[str] = mapped_column(Text, nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    reason_category: Mapped[str] = mapped_column(Text, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="OPEN")
    # DDL은 TIMESTAMPTZ다 — DateTime(timezone=True)를 명시해야 asyncpg가 tz-aware Python
    # datetime(datetime.now(UTC))을 그대로 바인딩할 수 있다(생략하면 SQLAlchemy가
    # TIMESTAMP WITHOUT TIME ZONE으로 캐스팅해 tz-aware 값 바인딩 시 asyncpg가 거부한다).
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
