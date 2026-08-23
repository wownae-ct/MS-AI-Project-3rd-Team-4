"""ai_invocations — 04_DB_schema.sql §C, 13_personalization_router_agent_design.md.

개인화 라우터 에이전트(route→generate→validate, 채팅 그래프와 별개) 호출 감사로그.
`app/services/personalization.py::run_personalization()`이 ONBOARDING_INITIAL/FIELD_UPDATED
매 호출마다 1행씩 기록한다. `trace_ref`는 14_langfuse_tracing_design.md 이후 실제 Langfuse
trace ID로 채워진다(트레이싱 비활성 시에는 여전히 NULL).

Importer: app/models/__init__.py."""

from datetime import datetime
from uuid import UUID as UUIDType
from uuid import uuid4

from sqlalchemy import ARRAY, CheckConstraint, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class AiInvocation(Base):
    __tablename__ = "ai_invocations"
    __table_args__ = (
        CheckConstraint(
            "trigger IN ('ONBOARDING_INITIAL','FIELD_UPDATED','MANUAL_REGENERATE')",
            name="ck_ai_invocations_trigger",
        ),
        CheckConstraint(
            "status IN ('SUCCESS','FAILED','BLOCKED')", name="ck_ai_invocations_status"
        ),
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
    trigger: Mapped[str] = mapped_column(Text, nullable=False)
    changed_fields: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    affected_domains: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    status: Mapped[str] = mapped_column(Text, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    trace_ref: Mapped[str | None] = mapped_column(Text)
    # DDL은 TIMESTAMPTZ다 — DateTime(timezone=True) 명시 이유는 app/models/checklist.py의
    # user_edited_at 주석 참고(같은 asyncpg 바인딩 문제).
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
