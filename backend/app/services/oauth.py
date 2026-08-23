"""소셜 로그인(구글/네이버) 실제 I/O — 토큰 교환·유저정보 조회(httpx)와 계정 조회/연동/생성(DB).
00_BASELINE.md §0-2 Should, §4-1. 라우팅은 app/routers/auth.py, 프로바이더 설정/state·PKCE
순수 헬퍼는 app/core/oauth_providers.py.

계정 연동 규칙: (auth_provider, auth_provider_id)로 먼저 찾고, 없으면 email로 기존 계정을
찾는다 — 있으면(자체 로그인 계정이든 다른 소셜 계정이든) 이 provider를 그 계정에 연동하지
않고 409로 거부한다. users.auth_provider/auth_provider_id는 계정당 1개 값만 가질 수 있는
컬럼(app/models/user.py 독스트링 "계정당 1개만")이라, 이미 다른 값이 채워진 계정에 새
provider를 덮어쓰면 기존 로그인 수단을 조용히 잃어버리는 위험한 동작이 되기 때문이다. 이
연동 자동화는 이번 라운드 스코프 밖 — 필요해지면 "이미 계정이 있습니다, 로그인 후 연동하세요"
같은 별도 흐름으로 다룰 문제."""

from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import api_error
from app.core.oauth_providers import OAuthProviderConfig
from app.models import User

_HTTP_TIMEOUT_SECONDS = 10.0


@dataclass(frozen=True)
class OAuthProfile:
    provider_user_id: str
    email: str
    email_verified: bool
    display_name: str | None
    profile_image_url: str | None


async def exchange_code_for_token(
    config: OAuthProviderConfig,
    *,
    code: str,
    code_verifier: str | None,
    redirect_uri: str,
    client_id: str,
    client_secret: str,
) -> str:
    """authorization code를 access_token으로 교환한다. 실패(코드 재사용/만료, redirect_uri
    불일치 등)는 이 함수 안에서 잡지 않고 그대로 전파 — app/routers/auth.py의 콜백 핸들러가
    한 곳에서 잡아 프론트 로그인 화면으로 에러 리다이렉트한다(로그인 중간에 원시 JSON 에러를
    브라우저 전체 화면에 그냥 띄우면 안 되므로)."""
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "client_secret": client_secret,
    }
    if config.supports_pkce and code_verifier is not None:
        data["code_verifier"] = code_verifier
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as http_client:
        response = await http_client.post(
            config.token_url, data=data, headers={"Accept": "application/json"}
        )
        response.raise_for_status()
        body = response.json()
    access_token = body.get("access_token")
    if not access_token:
        raise api_error(
            502, "UPSTREAM_LLM_ERROR", f"{config.code} 토큰 응답에 access_token이 없습니다."
        )
    return access_token


async def fetch_oauth_profile(config: OAuthProviderConfig, access_token: str) -> OAuthProfile:
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as http_client:
        response = await http_client.get(
            config.userinfo_url, headers={"Authorization": f"Bearer {access_token}"}
        )
        response.raise_for_status()
        body = response.json()
    if config.code == "GOOGLE":
        return _parse_google_profile(body)
    return _parse_naver_profile(body)


def _parse_google_profile(body: dict) -> OAuthProfile:
    """https://openidconnect.googleapis.com/v1/userinfo 응답 — sub/email/email_verified/
    name/picture."""
    return OAuthProfile(
        provider_user_id=body["sub"],
        email=body["email"],
        email_verified=bool(body.get("email_verified", False)),
        display_name=body.get("name"),
        profile_image_url=body.get("picture"),
    )


def _parse_naver_profile(body: dict) -> OAuthProfile:
    """https://openapi.naver.com/v1/nid/me 응답 — {"response": {"id","email","name",
    "profile_image", ...}}. 네이버는 email_verified 클레임을 별도로 안 주지만, "이메일" 제공
    항목이 승인된 앱은 검증된 이메일만 내려준다는 게 네이버 로그인 정책이라 email이 있으면
    검증된 것으로 취급한다."""
    profile = body["response"]
    return OAuthProfile(
        provider_user_id=profile["id"],
        email=profile["email"],
        email_verified=True,
        display_name=profile.get("name"),
        profile_image_url=profile.get("profile_image"),
    )


async def find_or_create_social_user(
    session: AsyncSession, provider: str, profile: OAuthProfile
) -> User:
    existing = (
        await session.execute(
            select(User).where(
                User.auth_provider == provider,
                User.auth_provider_id == profile.provider_user_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    by_email = (
        await session.execute(select(User).where(User.email == profile.email))
    ).scalar_one_or_none()
    if by_email is not None:
        if by_email.auth_provider is not None:
            raise api_error(
                409,
                "SOCIAL_ACCOUNT_ALREADY_LINKED",
                "이 이메일은 이미 다른 방식으로 가입돼 있습니다.",
            )
        by_email.auth_provider = provider
        by_email.auth_provider_id = profile.provider_user_id
        if profile.email_verified and by_email.email_verified_at is None:
            by_email.email_verified_at = datetime.now(UTC)
        return by_email

    user = User(
        email=profile.email,
        auth_provider=provider,
        auth_provider_id=profile.provider_user_id,
        display_name=profile.display_name,
        profile_image_url=profile.profile_image_url,
        email_verified_at=datetime.now(UTC) if profile.email_verified else None,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise api_error(409, "EMAIL_ALREADY_EXISTS", "이미 가입된 이메일입니다.") from exc
    return user
