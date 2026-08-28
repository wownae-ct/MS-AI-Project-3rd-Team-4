"""#2-5 실제 DB 로직. 03_API_spec.md ⓪ 인증.

signup/login 둘 다 성공 시 세션을 발급해 즉시 로그인 상태로 만든다(#2 "가입 직후 재로그인
요구 없음"). login은 "이메일 없음"과 "비밀번호 틀림"을 구분하지 않는다(#3 — 계정 존재 여부
노출 방지, user enumeration 방지)."""

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import api_error
from app.core.security import (
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)
from app.models import AuthSession, User, Wedding

logger = logging.getLogger(__name__)


async def create_user(session: AsyncSession, email: str, password: str, display_name: str) -> User:
    user = User(email=email, password_hash=hash_password(password), display_name=display_name)
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise api_error(409, "EMAIL_ALREADY_EXISTS", "이미 가입된 이메일입니다.") from exc
    return user


async def authenticate_user(session: AsyncSession, email: str, password: str) -> User:
    user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    # "이메일 없음"과 "비밀번호 틀림"을 같은 메시지/같은 지연 경로로 응답한다 — 둘 중 어느 쪽인지
    # 알려주면 공격자가 가입된 이메일 목록을 무차별로 알아낼 수 있다(user enumeration).
    invalid = api_error(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.")
    # 2026-08-26 레드팀 감사 4라운드 항목 15 — 로그인 실패 자체가 무로깅이라 rate limit(5/분)에
    # 걸리기 전의 저강도 무차별 대입 시도가 완전히 무관측이었다.
    if user is None or user.password_hash is None:
        logger.warning("Login failed for email=%s: no such account", email)
        raise invalid
    if not verify_password(password, user.password_hash):
        logger.warning("Login failed for user_id=%s: wrong password", user.id)
        raise invalid
    return user


async def issue_session(
    session: AsyncSession,
    settings: Settings,
    user: User,
    login_method: str,
    user_agent: str | None,
    ip_address: str | None,
) -> tuple[AuthSession, str]:
    """auth_sessions 1행 생성 + 쿠키에 심을 원문 토큰을 함께 반환한다(원문은 DB에 안 남음)."""
    raw_token = generate_session_token()
    auth_session = AuthSession(
        user_id=user.id,
        session_token_hash=hash_session_token(raw_token),
        login_method=login_method,
        expires_at=datetime.now(UTC) + timedelta(days=settings.session_ttl_days),
        user_agent=user_agent,
        ip_address=ip_address,
    )
    session.add(auth_session)
    user.last_login_at = datetime.now(UTC)
    return auth_session, raw_token


async def revoke_session_by_token(session: AsyncSession, raw_token: str) -> None:
    """로그아웃 — 이미 로그아웃된 토큰이어도 조용히 통과한다(#4 idempotent 204)."""
    token_hash = hash_session_token(raw_token)
    auth_session = (
        await session.execute(
            select(AuthSession).where(AuthSession.session_token_hash == token_hash)
        )
    ).scalar_one_or_none()
    if auth_session is not None and auth_session.revoked_at is None:
        auth_session.revoked_at = datetime.now(UTC)


async def get_user_by_session_token(session: AsyncSession, raw_token: str) -> User | None:
    """만료·폐기되지 않은 세션만 유효 — 라우터의 get_current_user 의존성이 이걸 호출한다."""
    token_hash = hash_session_token(raw_token)
    now = datetime.now(UTC)
    stmt = (
        select(User)
        .join(AuthSession, AuthSession.user_id == User.id)
        .where(
            AuthSession.session_token_hash == token_hash,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > now,
        )
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def user_has_wedding(session: AsyncSession, user_id: UUID) -> bool:
    stmt = select(Wedding.id).where(Wedding.owner_user_id == user_id)
    return (await session.execute(stmt)).scalar_one_or_none() is not None
