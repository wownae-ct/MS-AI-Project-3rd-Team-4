"""app/core/security.py — 비밀번호 해시/세션 토큰 순수 로직(DB 없이 도는 것만)."""

from app.core.security import (
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)


class TestPasswordHashing:
    def test_hash_is_not_the_plain_password(self):
        assert hash_password("Pw123456!") != "Pw123456!"

    def test_correct_password_verifies(self):
        hashed = hash_password("Pw123456!")
        assert verify_password("Pw123456!", hashed) is True

    def test_wrong_password_does_not_verify(self):
        hashed = hash_password("Pw123456!")
        assert verify_password("wrong-password", hashed) is False

    def test_same_password_hashes_differently_each_time(self):
        # argon2는 매번 랜덤 salt를 쓰므로 같은 입력도 해시가 달라야 한다(레인보우 테이블 방지).
        assert hash_password("Pw123456!") != hash_password("Pw123456!")


class TestSessionToken:
    def test_generated_tokens_are_unique(self):
        assert generate_session_token() != generate_session_token()

    def test_hash_is_deterministic(self):
        token = generate_session_token()
        assert hash_session_token(token) == hash_session_token(token)

    def test_different_tokens_hash_differently(self):
        assert hash_session_token("token-a") != hash_session_token("token-b")

    def test_hash_does_not_leak_the_raw_token(self):
        token = generate_session_token()
        assert token not in hash_session_token(token)
