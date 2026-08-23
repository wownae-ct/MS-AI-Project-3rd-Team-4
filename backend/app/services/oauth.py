"""소셜 로그인(구글/네이버/카카오/애플) 실제 I/O — 토큰 교환·유저정보 조회(httpx)와 계정
조회/연동/생성(DB). 00_BASELINE.md §0-2 Should, §4-1, 15_post_v4_scope_promotion.md §P1.
라우팅은 app/routers/auth.py, 프로바이더 설정/state·PKCE 순수 헬퍼는 app/core/oauth_providers.py.

애플만 신원 확인 방식이 다르다 — 나머지 3개는 access_token으로 userinfo 엔드포인트를 GET하지만,
애플은 그런 엔드포인트가 없고 토큰 교환 응답에 같이 오는 id_token(JWT)의 클레임(sub/email/
email_verified)이 곧 신원 정보다. 이 id_token은 애플이 RS256으로 서명하므로(우리가 애플에게
보내는 client_secret JWT는 반대로 우리가 ES256으로 서명 — 서명 방향과 알고리즘이 서로 다르다,
헷갈리지 말 것) 애플 JWKS(`https://appleid.apple.com/auth/keys`)로 서명을 검증해야 클레임을
신뢰할 수 있다.

계정 연동 규칙: (auth_provider, auth_provider_id)로 먼저 찾고, 없으면 email로 기존 계정을
찾는다 — 있으면(자체 로그인 계정이든 다른 소셜 계정이든) 이 provider를 그 계정에 연동하지
않고 409로 거부한다. users.auth_provider/auth_provider_id는 계정당 1개 값만 가질 수 있는
컬럼(app/models/user.py 독스트링 "계정당 1개만")이라, 이미 다른 값이 채워진 계정에 새
provider를 덮어쓰면 기존 로그인 수단을 조용히 잃어버리는 위험한 동작이 되기 때문이다. 이
연동 자동화는 이번 라운드 스코프 밖 — 필요해지면 "이미 계정이 있습니다, 로그인 후 연동하세요"
같은 별도 흐름으로 다룰 문제."""

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
import jwt
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import api_error
from app.core.oauth_providers import OAuthProviderConfig
from app.models import User

_HTTP_TIMEOUT_SECONDS = 10.0
_APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
_APPLE_ISSUER = "https://appleid.apple.com"


@dataclass(frozen=True)
class OAuthProfile:
    provider_user_id: str
    email: str
    email_verified: bool
    display_name: str | None
    profile_image_url: str | None


@dataclass(frozen=True)
class OAuthTokens:
    access_token: str | None  # 애플은 이 필드를 안 씀(신원 확인에 id_token만 쓴다) — 그래도
    # 애플 토큰 응답에도 access_token 자체는 포함돼 있어 값은 채워둔다.
    id_token: str | None  # 애플만 필수. 나머지 프로바이더는 응답에 있어도 검증·사용 안 함.


async def exchange_code_for_token(
    config: OAuthProviderConfig,
    *,
    code: str,
    code_verifier: str | None,
    redirect_uri: str,
    client_id: str,
    client_secret: str,
) -> OAuthTokens:
    """authorization code를 토큰으로 교환한다. 실패(코드 재사용/만료, redirect_uri 불일치 등)는
    이 함수 안에서 잡지 않고 그대로 전파 — app/routers/auth.py의 콜백 핸들러가 한 곳에서 잡아
    프론트 로그인 화면으로 에러 리다이렉트한다(로그인 중간에 원시 JSON 에러를 브라우저 전체
    화면에 그냥 띄우면 안 되므로)."""
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
    id_token = body.get("id_token")
    if config.code == "APPLE":
        if not id_token:
            raise api_error(502, "UPSTREAM_LLM_ERROR", "애플 토큰 응답에 id_token이 없습니다.")
    elif not access_token:
        raise api_error(
            502, "UPSTREAM_LLM_ERROR", f"{config.code} 토큰 응답에 access_token이 없습니다."
        )
    return OAuthTokens(access_token=access_token, id_token=id_token)


async def fetch_oauth_profile(
    config: OAuthProviderConfig, tokens: OAuthTokens, *, client_id: str
) -> OAuthProfile:
    """`client_id`는 애플의 id_token `aud` 클레임 검증에만 쓰인다(나머지 프로바이더는 무시) —
    userinfo_url이 없는 애플은 access_token으로 뭘 조회하는 대신 토큰 교환 때 같이 받은
    id_token 자체를 검증해서 신원을 확인하기 때문에, "이 토큰이 정말 우리 앱 앞으로 발급된
    것인가"를 여기서 직접 확인해야 한다."""
    if config.code == "APPLE":
        return await _parse_apple_profile(tokens.id_token, expected_audience=client_id)

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as http_client:
        response = await http_client.get(
            config.userinfo_url, headers={"Authorization": f"Bearer {tokens.access_token}"}
        )
        response.raise_for_status()
        body = response.json()
    if config.code == "GOOGLE":
        return _parse_google_profile(body)
    if config.code == "KAKAO":
        return _parse_kakao_profile(body)
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


def _parse_kakao_profile(body: dict) -> OAuthProfile:
    """https://kapi.kakao.com/v1/oidc/userinfo 응답 — 표준 OIDC 클레임 형태
    (sub/email/email_verified/nickname/picture)라 구버전 REST API(kapi.kakao.com/v2/user/me,
    중첩된 kakao_account 구조)와 달리 평평하다."""
    return OAuthProfile(
        provider_user_id=body["sub"],
        email=body["email"],
        email_verified=bool(body.get("email_verified", False)),
        display_name=body.get("nickname"),
        profile_image_url=body.get("picture"),
    )


async def _parse_apple_profile(id_token: str | None, *, expected_audience: str) -> OAuthProfile:
    """애플은 userinfo 엔드포인트가 없다 — id_token(JWT) 클레임이 곧 신원 정보다. 애플
    JWKS(`_APPLE_JWKS_URL`)로 서명을 검증해야 클레임을 신뢰할 수 있다(그러지 않으면 누구나
    조작한 id_token으로 임의의 이메일을 자처할 수 있음). `PyJWKClient`가 JWKS 조회 + kid로
    맞는 키 찾기를 내부적으로 처리하지만 동기(블로킹) I/O라 이벤트 루프를 막지 않도록
    `asyncio.to_thread`로 감싼다 — 로그인 콜백 1회당 한 번뿐이라 별도 캐싱 계층은 두지 않는다
    (YAGNI, 이 프로젝트는 Redis 등 별도 캐시 서버 도입을 금지)."""
    if not id_token:
        raise api_error(502, "UPSTREAM_LLM_ERROR", "애플 id_token이 없습니다.")

    def _verify() -> dict:
        signing_key = PyJWKClient(_APPLE_JWKS_URL).get_signing_key_from_jwt(id_token).key
        return jwt.decode(
            id_token,
            key=signing_key,
            algorithms=["RS256"],
            audience=expected_audience,
            issuer=_APPLE_ISSUER,
        )

    claims = await asyncio.to_thread(_verify)
    # email_verified는 애플 토큰 버전에 따라 JSON bool(true) 또는 문자열("true")로 온다 —
    # 둘 다 처리(애플 개발자 포럼에 알려진 비일관성, https://developer.apple.com/forums/thread/762519).
    email_verified_raw = claims.get("email_verified", False)
    email_verified = email_verified_raw is True or str(email_verified_raw).lower() == "true"
    return OAuthProfile(
        provider_user_id=claims["sub"],
        email=claims["email"],
        email_verified=email_verified,
        # 애플은 이름을 id_token에 안 담는다 — 최초 로그인 1회에 한해 콜백 POST 바디의 별도
        # `user` JSON 필드로만 온다(app/routers/auth.py의 apple 콜백 핸들러가 있으면 채워 씀,
        # 재로그인부터는 항상 None).
        display_name=None,
        profile_image_url=None,
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
