"""소셜 로그인(구글/네이버/카카오/애플) 프로바이더 설정 + state/PKCE 순수 헬퍼 — 00_BASELINE.md
§0-2 Should + 15_post_v4_scope_promotion.md §P1(카카오/애플 추가). §4-1(BFF + OIDC Authorization
Code + PKCE). I/O(httpx 호출, DB) 없는 순수 로직만 여기 둔다 — 실제 토큰 교환/유저정보 조회는
app/services/oauth.py, 라우팅은 app/routers/auth.py.

PKCE 지원 여부는 프로바이더마다 다르다 — 구글(OIDC)/카카오(2023년부터 OIDC 지원)는 지원하지만,
네이버(자체 REST OAuth2)/애플은 지원하지 않는다(애플 공식 문서에 code_challenge 계열 파라미터가
없음 — PKCE 지원 여부가 출처마다 엇갈려 보이지만 안전하게 미지원으로 취급). `supports_pkce=False`
프로바이더는 CSRF 방어를 state 쿠키만으로 건다(네이버와 동일 패턴).

애플은 나머지 3개와 두 가지가 다르다: (1) 별도 userinfo 엔드포인트가 없고 신원 정보가 토큰
교환 응답의 id_token(JWT) 클레임에 담겨온다(app/services/oauth.py에서 처리) — 그래서
`userinfo_url`은 애플만 None. (2) `scope`(name/email)를 요청하면 애플이
`response_mode=form_post`를 강제해 콜백이 GET이 아니라 POST(form-urlencoded)로 온다 —
`response_mode` 필드로 이 차이를 표현하고, app/routers/auth.py가 애플 전용 POST 콜백 라우트를
따로 둔다."""

import base64
import hashlib
import json
import secrets
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import quote

import jwt

OAUTH_STATE_COOKIE_NAME = "wr_oauth_state"
OAUTH_STATE_TTL_SECONDS = 600  # 로그인 리다이렉트 왕복이 10분을 넘기면 다시 시작해야 한다.
SUPPORTED_PROVIDERS: tuple[str, ...] = ("GOOGLE", "NAVER", "KAKAO", "APPLE")


@dataclass(frozen=True)
class OAuthProviderConfig:
    code: str  # users.auth_provider / auth_sessions.login_method CHECK 값과 동일 문자열
    authorize_url: str
    token_url: str
    userinfo_url: str | None  # 애플만 None — 신원 정보가 id_token 클레임으로 온다.
    scope: str | None
    supports_pkce: bool
    response_mode: str | None = None  # 애플만 "form_post" — 나머지는 기본(query, GET 콜백).


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
    "KAKAO": OAuthProviderConfig(
        code="KAKAO",
        authorize_url="https://kauth.kakao.com/oauth/authorize",
        token_url="https://kauth.kakao.com/oauth/token",
        # OIDC 전용 userinfo — 구버전 REST API `kapi.kakao.com/v2/user/me`(중첩된
        # kakao_account 구조)가 아니라 카카오 OIDC well-known이 가리키는 평평한 OIDC 표준
        # 클레임(sub/email/email_verified/nickname/picture) 엔드포인트를 쓴다.
        userinfo_url="https://kapi.kakao.com/v1/oidc/userinfo",
        scope="openid account_email",
        supports_pkce=True,
    ),
    "APPLE": OAuthProviderConfig(
        code="APPLE",
        authorize_url="https://appleid.apple.com/auth/authorize",
        token_url="https://appleid.apple.com/auth/token",
        userinfo_url=None,
        # 애플은 "openid"가 아니라 "name"/"email" 값을 쓴다(표준 OIDC와 다른 부분). email
        # 스코프가 있어야 id_token에 email 클레임이 실린다.
        scope="name email",
        supports_pkce=False,
        response_mode="form_post",
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
    if config.response_mode:
        params["response_mode"] = config.response_mode
    query = "&".join(f"{key}={quote(value, safe='')}" for key, value in params.items())
    return f"{config.authorize_url}?{query}"


def build_apple_client_secret(
    *,
    team_id: str,
    client_id: str,
    key_id: str,
    private_key_pem: str,
    issued_at: datetime,
    ttl_seconds: int = 300,
) -> str:
    """애플은 client_secret이 고정 문자열이 아니라 팀이 직접 서명하는 JWT다(ES256, Apple
    Developer에서 발급받은 "Sign in with Apple" 키의 개인키로 서명) — 매 토큰교환 요청 시점에
    새로 만들어 쓴다(최대 유효기간은 6개월이지만, 캐싱 인프라를 새로 두느니 매번 짧게(기본 5분)
    새로 발급하는 쪽이 이 프로젝트의 YAGNI 원칙에 맞는다). header의 kid, payload의 iss(Team
    ID)/sub(client_id, 이 프로젝트에선 웹용 Services ID)가 애플 문서가 요구하는 정확한 필드명."""
    now_ts = int(issued_at.timestamp())
    return jwt.encode(
        {
            "iss": team_id,
            "iat": now_ts,
            "exp": now_ts + ttl_seconds,
            "aud": "https://appleid.apple.com",
            "sub": client_id,
        },
        private_key_pem,
        algorithm="ES256",
        headers={"kid": key_id},
    )


def parse_apple_user_display_name(raw_user_field: str) -> str | None:
    """애플 콜백이 **최초 로그인 1회에 한해서만** 보내주는 `user` 폼 필드(JSON 문자열, 예:
    '{"name":{"firstName":"길동","lastName":"홍"}}') 파싱 — 재로그인부터는 이 필드 자체가
    안 온다. 형식이 다르거나 파싱에 실패해도 표시 이름 없이 로그인 자체는 계속 진행돼야 하므로
    예외를 던지지 않고 None을 반환한다."""
    try:
        parsed = json.loads(raw_user_field)
    except (TypeError, ValueError):
        return None
    name = parsed.get("name") if isinstance(parsed, dict) else None
    if not isinstance(name, dict):
        return None
    parts = [name.get("firstName"), name.get("lastName")]
    joined = " ".join(part for part in parts if part)
    return joined or None
