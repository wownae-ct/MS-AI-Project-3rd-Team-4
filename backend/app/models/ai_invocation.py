"""ai_invocations — 04_DB_schema.sql §C, 13_personalization_router_agent_design.md.

개인화 라우터 에이전트(route→generate→validate, 채팅 그래프와 별개) 호출 감사로그. 이 세션
범위에서는 에이전트 자체를 구현하지 않으므로 이 모델은 지금 온보딩(`ONBOARDING_INITIAL`)
시점의 로그 1행 기록에만 쓰인다 — `route_reasoning`처럼 화면 비노출 필드는 `error_message`/
`trace_ref`에 준하는 감사용 텍스트로, 실제 라우터 에이전트가 붙을 때 값이 채워진다.

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
