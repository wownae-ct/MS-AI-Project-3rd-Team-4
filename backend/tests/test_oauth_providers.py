"""app/core/oauth_providers.py 순수 로직 테스트 — I/O 없음, DB/네트워크 불필요."""

import base64
import hashlib

from app.core.oauth_providers import (
    build_authorization_url,
    build_callback_redirect_uri,
    generate_pkce_pair,
    get_provider_config,
)


class TestGetProviderConfig:
    def test_google_and_naver_resolve_case_insensitively(self):
        assert get_provider_config("google").code == "GOOGLE"
        assert get_provider_config("GOOGLE").code == "GOOGLE"
        assert get_provider_config("naver").code == "NAVER"

    def test_unsupported_provider_returns_none(self):
        assert get_provider_config("kakao") is None
        assert get_provider_config("apple") is None


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
