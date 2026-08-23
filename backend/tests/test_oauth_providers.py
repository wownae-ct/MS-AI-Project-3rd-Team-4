"""app/core/oauth_providers.py 순수 로직 테스트 — I/O 없음, DB/네트워크 불필요."""

import base64
import hashlib
from datetime import UTC, datetime

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.core.oauth_providers import (
    build_apple_client_secret,
    build_authorization_url,
    build_callback_redirect_uri,
    generate_pkce_pair,
    get_provider_config,
    parse_apple_user_display_name,
)

# 테스트 전용 EC(P-256) 키 — 실제 애플 계정과 무관, 어디에도 등록되지 않은 키. 서명/검증
# 왕복만 확인하면 되므로 매 테스트마다 새로 생성하지 않고 모듈 레벨에서 한 번만 만든다.
_TEST_EC_KEY = ec.generate_private_key(ec.SECP256R1())
_TEST_PRIVATE_KEY_PEM = _TEST_EC_KEY.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption(),
).decode()
_TEST_PUBLIC_KEY_PEM = (
    _TEST_EC_KEY.public_key()
    .public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    .decode()
)


class TestGetProviderConfig:
    def test_google_and_naver_resolve_case_insensitively(self):
        assert get_provider_config("google").code == "GOOGLE"
        assert get_provider_config("GOOGLE").code == "GOOGLE"
        assert get_provider_config("naver").code == "NAVER"

    def test_kakao_and_apple_resolve(self):
        assert get_provider_config("kakao").code == "KAKAO"
        assert get_provider_config("KAKAO").code == "KAKAO"
        assert get_provider_config("apple").code == "APPLE"

    def test_unsupported_provider_returns_none(self):
        assert get_provider_config("facebook") is None


class TestGeneratePkcePair:
    def test_challenge_matches_sha256_of_verifier(self):
        code_verifier, code_challenge = generate_pkce_pair()
        expected = (
            base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode("ascii")).digest())
            .rstrip(b"=")
            .decode("ascii")
        )
        assert code_challenge == expected

    def test_each_call_is_unique(self):
        pair_a = generate_pkce_pair()
        pair_b = generate_pkce_pair()
        assert pair_a != pair_b


class TestBuildCallbackRedirectUri:
    def test_appends_provider_callback_path(self):
        uri = build_callback_redirect_uri("https://merrymap-production.example.com", "google")
        assert uri == "https://merrymap-production.example.com/api/v1/auth/google/callback"


class TestBuildAuthorizationUrl:
    def test_google_includes_pkce_and_scope(self):
        config = get_provider_config("google")
        url = build_authorization_url(
            config,
            client_id="cid",
            redirect_uri="https://api.example.com/api/v1/auth/google/callback",
            state="s1",
            code_challenge="c1",
        )
        assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
        assert "client_id=cid" in url
        assert "state=s1" in url
        assert "code_challenge=c1" in url
        assert "code_challenge_method=S256" in url
        assert "scope=openid" in url

    def test_naver_omits_pkce_and_scope(self):
        config = get_provider_config("naver")
        url = build_authorization_url(
            config,
            client_id="cid",
            redirect_uri="https://api.example.com/api/v1/auth/naver/callback",
            state="s1",
            code_challenge="c1",
        )
        assert url.startswith("https://nid.naver.com/oauth2.0/authorize?")
        assert "code_challenge" not in url
        assert "scope=" not in url

    def test_kakao_includes_pkce_and_openid_scope(self):
        config = get_provider_config("kakao")
        url = build_authorization_url(
            config,
            client_id="cid",
            redirect_uri="https://api.example.com/api/v1/auth/kakao/callback",
            state="s1",
            code_challenge="c1",
        )
        assert url.startswith("https://kauth.kakao.com/oauth/authorize?")
        assert "code_challenge=c1" in url
        assert "code_challenge_method=S256" in url
        assert "scope=openid" in url
        assert "response_mode" not in url

    def test_apple_omits_pkce_and_forces_form_post(self):
        config = get_provider_config("apple")
        url = build_authorization_url(
            config,
            client_id="cid",
            redirect_uri="https://api.example.com/api/v1/auth/apple/callback",
            state="s1",
            code_challenge="c1",
        )
        assert url.startswith("https://appleid.apple.com/auth/authorize?")
        assert "code_challenge" not in url
        assert "response_mode=form_post" in url
        assert "scope=name" in url


class TestBuildAppleClientSecret:
    def test_produces_jwt_verifiable_with_matching_public_key(self):
        issued_at = datetime(2026, 1, 1, tzinfo=UTC)
        token = build_apple_client_secret(
            team_id="TEAMID1234",
            client_id="com.example.service",
            key_id="KEYID12345",
            private_key_pem=_TEST_PRIVATE_KEY_PEM,
            issued_at=issued_at,
            ttl_seconds=300,
        )

        header = jwt.get_unverified_header(token)
        assert header["alg"] == "ES256"
        assert header["kid"] == "KEYID12345"

        # issued_at은 고정된 과거 시각이라(재현 가능한 테스트를 위해) 실제 벽시계 기준으로는
        # 이미 만료됐다 — 여기서 검증하려는 건 "만료 안 됐는지"가 아니라 클레임 구성·서명
        # 정합성이므로 exp 검증만 끈다.
        claims = jwt.decode(
            token,
            key=_TEST_PUBLIC_KEY_PEM,
            algorithms=["ES256"],
            audience="https://appleid.apple.com",
            options={"verify_exp": False},
        )
        assert claims["iss"] == "TEAMID1234"
        assert claims["sub"] == "com.example.service"
        assert claims["exp"] == claims["iat"] + 300

    def test_wrong_key_fails_verification(self):
        other_key = ec.generate_private_key(ec.SECP256R1())
        other_public_pem = (
            other_key.public_key()
            .public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            .decode()
        )
        token = build_apple_client_secret(
            team_id="TEAMID1234",
            client_id="com.example.service",
            key_id="KEYID12345",
            private_key_pem=_TEST_PRIVATE_KEY_PEM,
            issued_at=datetime(2026, 1, 1, tzinfo=UTC),
        )

        with pytest.raises(jwt.InvalidSignatureError):
            jwt.decode(
                token,
                key=other_public_pem,
                algorithms=["ES256"],
                audience="https://appleid.apple.com",
            )


class TestParseAppleUserDisplayName:
    def test_combines_first_and_last_name(self):
        raw = '{"name": {"firstName": "길동", "lastName": "홍"}, "email": "x@example.com"}'
        assert parse_apple_user_display_name(raw) == "길동 홍"

    def test_missing_name_returns_none(self):
        assert parse_apple_user_display_name('{"email": "x@example.com"}') is None

    def test_invalid_json_returns_none_without_raising(self):
        assert parse_apple_user_display_name("not-json") is None
