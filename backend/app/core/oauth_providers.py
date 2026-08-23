"""소셜 로그인(구글/네이버) 프로바이더 설정 + state/PKCE 순수 헬퍼 — 00_BASELINE.md §0-2 Should,
§4-1(BFF + OIDC Authorization Code + PKCE). I/O(httpx 호출, DB) 없는 순수 로직만 여기 둔다 —
실제 토큰 교환/유저정보 조회는 app/services/oauth.py, 라우팅은 app/routers/auth.py.

구글은 OIDC 준수라 PKCE(S256)를 지원하지만, 네이버는 자체 REST OAuth2라 PKCE 파라미터를
지원하지 않는다(공식 문서에 code_challenge 계열 파라미터가 없음) — `supports_pkce=False`로
프로바이더별 능력 차이를 명시하고, CSRF 방어는 두 프로바이더 모두 필수인 state로만 건다."""

import base64
import hashlib
import secrets
from dataclasses import dataclass
from urllib.parse import quote

OAUTH_STATE_COOKIE_NAME = "wr_oauth_state"
OAUTH_STATE_TTL_SECONDS = 600  # 로그인 리다이렉트 왕복이 10분을 넘기면 다시 시작해야 한다.
SUPPORTED_PROVIDERS: tuple[str, ...] = ("GOOGLE", "NAVER")


@dataclass(frozen=True)
class OAuthProviderConfig:
    code: str  # users.auth_provider / auth_sessions.login_method CHECK 값과 동일 문자열
    authorize_url: str
    token_url: str
    userinfo_url: str
    scope: str | None
    supports_pkce: bool


_PROVIDERS: dict[str, OAuthProviderConfig] = {
    "GOOGLE": OAuthProviderConfig(
        code="GOOGLE",
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        userinfo_url="https://openidconnect.googleapis.com/v1/userinfo",
        scope="openid email profile",
        supports_pkce=True,
    ),
    "NAVER": OAuthProviderConfig(
        code="NAVER",
        authorize_url="https://nid.naver.com/oauth2.0/authorize",
        token_url="https://nid.naver.com/oauth2.0/token",
        userinfo_url="https://openapi.naver.com/v1/nid/me",
        # 네이버는 scope 요청 파라미터가 아니라 개발자센터에 등록해둔 앱의 "제공 정보" 항목으로
        # 이메일/이름 제공 여부가 정해진다 — URL에 실어 보낼 값이 없다.
        scope=None,
        supports_pkce=False,
    ),
}


def get_provider_config(provider_path_segment: str) -> OAuthProviderConfig | None:
    """URL 세그먼트(소문자, 예: "google")를 §1 CHECK 제약과 같은 대문자 코드로 매핑한다.
    지원하지 않는 provider면 None — 라우터가 404로 변환한다."""
    return _PROVIDERS.get(provider_path_segment.upper())


def generate_oauth_state() -> str:
    return secrets.token_urlsafe(32)


def generate_pkce_pair() -> tuple[str, str]:
    """(code_verifier, code_challenge) — RFC 7636 S256. code_verifier는 콜백 때 토큰 교환
    요청에 그대로 실어 보내야 하므로 state와 함께 임시 쿠키에 담아 왕복시킨다."""
    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return code_verifier, code_challenge


def build_callback_redirect_uri(oauth_backend_base_url: str, provider_path_segment: str) -> str:
    """IdP 콘솔에 등록해둔 콜백 주소와 문자 그대로 일치해야 하는 값이라 이 함수 하나로만
    조립한다(로그인 리다이렉트 때 IdP에 보내는 값과 콜백에서 토큰 교환 때 다시 보내는 값이
    OAuth2 스펙상 반드시 같아야 함 — RFC 6749 §4.1.3)."""
    return f"{oauth_backend_base_url}/api/v1/auth/{provider_path_segment}/callback"


def build_authorization_url(
    config: OAuthProviderConfig,
    *,
    client_id: str,
    redirect_uri: str,
    state: str,
    code_challenge: str | None,
) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": state,
    }
    if config.scope:
        params["scope"] = config.scope
    if config.supports_pkce and code_challenge is not None:
        params["code_challenge"] = code_challenge
        params["code_challenge_method"] = "S256"
    query = "&".join(f"{key}={quote(value, safe='')}" for key, value in params.items())
    return f"{config.authorize_url}?{query}"
