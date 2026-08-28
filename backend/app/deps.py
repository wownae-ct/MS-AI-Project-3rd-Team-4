"""공용 FastAPI 의존성. v4.0(인증 재도입)부터 "시드된 단일 weddings 행"이 아니라 실제 로그인
세션에서 유도한 사용자/웨딩이 모든 요청의 대상이다 — get_the_wedding()은 폐기, 두 단계
의존성(get_current_user → get_current_wedding)으로 교체."""

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session
from app.core.errors import api_error
from app.models import User, Wedding
from app.services.auth import get_user_by_session_token


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> User:
    """쿠키(wr_session)에서 세션 토큰을 읽어 유효한 사용자로 해석한다. 쿠키가 없거나
    만료·폐기된 세션이면 401 UNAUTHORIZED — 프론트는 이 응답을 받으면 S0(로그인)으로 이동."""
    settings = get_settings()
    raw_token = request.cookies.get(settings.session_cookie_name)
    if raw_token is None:
        raise api_error(401, "UNAUTHORIZED", "로그인이 필요합니다.")
    user = await get_user_by_session_token(session, raw_token)
    if user is None:
        raise api_error(401, "UNAUTHORIZED", "세션이 만료됐거나 유효하지 않습니다.")
    # app/core/rate_limit.py::user_or_ip_key가 계정 단위 rate limit 키로 읽는다 — 인증된
    # 요청은 IP가 아니라 계정 기준으로 제한해야 한 계정이 여러 IP를 돌려써도 LLM 비용
    # 유발 엔드포인트를 무제한 호출 못 한다.
    request.state.user_id = str(user.id)
    return user


async def get_current_wedding(
    user: User = Depends(get_current_user),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> Wedding:
    """로그인한 사용자의 웨딩 프로필을 반환한다. 아직 온보딩 전이면 404
    WEDDING_NOT_FOUND(03_API_spec.md §2) — 프론트는 S1(온보딩)으로 이동."""
    wedding = (
        await session.execute(select(Wedding).where(Wedding.owner_user_id == user.id))
    ).scalar_one_or_none()
    if wedding is None:
        raise api_error(
            404, "WEDDING_NOT_FOUND", "웨딩 프로필이 아직 없습니다. 온보딩을 먼저 진행하세요."
        )
    return wedding
