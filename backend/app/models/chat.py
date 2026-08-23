"""chat_sessions / chat_messages — 04_DB_spec.md §4-(13)(14), §7 DDL.

be2aad3d6908이 v3.0 shape(category_id → 이미 드롭된 categories 테이블 FK)를 v4.0으로 재생성했다 —
category_code는 app/models/wedding.py의 CategoryCodeEnum(63c0e2ae03d4가 만든 기존 ENUM 타입)을
재사용한다.

Importer: app/models/__init__.py."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base
from app.models.wedding import CategoryCodeEnum


class ChatSession(Base):
    __tablename__ = "chat_sessions"

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
    category_code: Mapped[str | None] = mapped_column(CategoryCodeEnum)
    # title/last_message_at: 03_API_spec.md 전체에 GET /chat/sessions(목록) 엔드포인트가 없어
    # 이 두 컬럼을 읽는 소비자가 이번 스코프엔 하나도 없다 — 그래서 지금은 아무도 채우지 않고
    # null로만 둔다(#27 응답 예시도 "title": null). 상담 이력 목록 화면이 생기면 그때
    # stream_chat_response 등에 채우는 로직을 추가하면 된다.
    title: Mapped[str | None] = mapped_column(Text)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # DDL은 TIMESTAMPTZ다 — DateTime(timezone=True)를 명시해야 asyncpg가 tz-aware Python
    # datetime(datetime.now(UTC))을 그대로 바인딩할 수 있다(생략하면 SQLAlchemy가
    # TIMESTAMP WITHOUT TIME ZONE으로 캐스팅해 tz-aware 값 바인딩 시 asyncpg가 거부한다).
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        CheckConstraint("role IN ('user','assistant')", name="ck_chat_messages_role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    citations: Mapped[list | None] = mapped_column(JSONB)
    verification: Mapped[dict | None] = mapped_column(JSONB)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    trace_ref: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
