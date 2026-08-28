"""users / auth_sessions — 04_DB_schema.sql, BASELINE v4.0 ① 인증 재도입.

DDL은 전부 TIMESTAMPTZ인데 DateTime(timezone=True)를 명시 안 해서 SQLAlchemy가 TIMESTAMP
WITHOUT TIME ZONE으로 캐스팅하던 버그를 2026-08-24 수정 — app/services/auth.py가
datetime.now(UTC)(tz-aware)를 매 로그인마다 넣고 비교(get_user_by_session_token의
AuthSession.expires_at > now)해서 asyncpg가 "can't subtract offset-naive and offset-aware
datetimes"로 매번 죽고 있었다(dev-53 세션이 checklist_items/timeline_items/ai_invocations에서
같은 패턴을 먼저 겪고 고친 뒤 발견해 알려줌). checklist.py/timeline.py/ai_invocation.py와
동일한 처방.

Importer: app/models/__init__.py."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class User(Base):
    """password_hash가 NULL이면 소셜 로그인 전용 계정(Must 범위는 자체 로그인만이라 현재는
    항상 채워짐). auth_provider/auth_provider_id는 둘 다 NULL이거나 둘 다 있어야 한다(DB CHECK)."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "(auth_provider IS NULL) = (auth_provider_id IS NULL)",
            name="ck_users_auth_provider_pair",
        ),
        CheckConstraint(
            "auth_provider IN ('GOOGLE','KAKAO','NAVER','APPLE')", name="ck_users_auth_provider"
        ),
        CheckConstraint("status IN ('ACTIVE','SUSPENDED','DELETED')", name="ck_users_status"),
        UniqueConstraint("auth_provider", "auth_provider_id", name="uq_users_provider_identity"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(Text)
    auth_provider: Mapped[str | None] = mapped_column(Text)
    auth_provider_id: Mapped[str | None] = mapped_column(Text)
    display_name: Mapped[str | None] = mapped_column(Text)
    profile_image_url: Mapped[str | None] = mapped_column(Text)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="ACTIVE")
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    terms_agreed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    privacy_policy_version: Mapped[str | None] = mapped_column(Text)
    anonymized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuthSession(Base):
    """BFF + Opaque 세션 쿠키(wr_session) 방식 — 쿠키엔 불투명 토큰만 담고, 여기엔 그 토큰의
    SHA-256 해시만 저장한다(원문 토큰은 DB에 절대 남기지 않음, app/core/security.py 참고)."""

    __tablename__ = "auth_sessions"
    __table_args__ = (
        CheckConstraint(
            "login_method IN ('LOCAL','GOOGLE','KAKAO','NAVER','APPLE')",
            name="ck_auth_sessions_login_method",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_token_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    login_method: Mapped[str] = mapped_column(Text, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(Text)
