"""#2-5 — 03_API_spec.md ⓪ 인증. 소셜 로그인(카카오/네이버/구글/애플)은 Should라 이번 Must
범위에는 자체 이메일/비밀번호만 있다(00_BASELINE.md §0)."""

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session
from app.deps import get_current_user
from app.models import User
from app.schemas.auth import AuthUserOut, LoginRequest, SignupRequest
from app.services.auth import (
    authenticate_user,
    create_user,
    issue_session,
    revoke_session_by_token,
    user_has_wedding,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.session_ttl_days * 24 * 60 * 60,
    )


@router.post("/signup", response_model=AuthUserOut, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignupRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> AuthUserOut:
    user = await create_user(session, payload.email, payload.password, payload.display_name)
    await session.flush()
    _, raw_token = await issue_session(
        session,
        get_settings(),
        user,
        "LOCAL",
        request.headers.get("user-agent"),
        request.client.host if request.client else None,
    )
    await session.commit()
    _set_session_cookie(response, raw_token)
    return AuthUserOut(
        id=user.id, email=user.email, display_name=user.display_name, has_wedding=False
    )


@router.post("/login", response_model=AuthUserOut)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> AuthUserOut:
    user = await authenticate_user(session, payload.email, payload.password)
    _, raw_token = await issue_session(
        session,
        get_settings(),
        user,
        "LOCAL",
        request.headers.get("user-agent"),
        request.client.host if request.client else None,
    )
    has_wedding = await user_has_wedding(session, user.id)
    await session.commit()
    _set_session_cookie(response, raw_token)
    return AuthUserOut(
        id=user.id, email=user.email, display_name=user.display_name, has_wedding=has_wedding
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> None:
    """이미 로그아웃 상태여도(쿠키 없음/이미 폐기된 세션) 에러 없이 204 — idempotent(#4)."""
    settings = get_settings()
    raw_token = request.cookies.get(settings.session_cookie_name)
    if raw_token is not None:
        await revoke_session_by_token(session, raw_token)
        await session.commit()
    response.delete_cookie(key=settings.session_cookie_name)


@router.get("/me", response_model=AuthUserOut)
async def get_me(
    user: User = Depends(get_current_user),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> AuthUserOut:
    has_wedding = await user_has_wedding(session, user.id)
    return AuthUserOut(
        id=user.id, email=user.email, display_name=user.display_name, has_wedding=has_wedding
    )
