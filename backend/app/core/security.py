"""비밀번호 해시 + 세션 토큰 발급/해시. BASELINE v4.0 ① 인증, 07_technical_design.md §1
(BFF + Opaque 세션 쿠키) — 쿠키엔 불투명 랜덤 토큰만 담고, DB(auth_sessions.session_token_hash)엔
그 토큰의 SHA-256 해시만 저장한다. DB가 유출돼도 쿠키 값 자체는 복원 불가능해야 하기 때문이다.

argon2-cffi를 쓴다 — 07_technical_design.md가 "argon2/bcrypt" 둘 다 후보로 남겨뒀는데, OWASP가
bcrypt보다 argon2를 우선 권고하고 3.12용 wheel도 있어 더 나은 기본값으로 판단(2026-08-24)."""

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_password_hasher = PasswordHasher()

SESSION_TOKEN_BYTES = 32  # secrets.token_urlsafe(32) ≈ 43자, 브루트포스에 충분한 엔트로피


def hash_password(plain_password: str) -> str:
    return _password_hasher.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, plain_password)
    except VerifyMismatchError:
        return False


def generate_session_token() -> str:
    """쿠키에 담을 원문 토큰 — DB에는 저장하지 않고 해시만 저장한다."""
    return secrets.token_urlsafe(SESSION_TOKEN_BYTES)


def hash_session_token(token: str) -> str:
    """쿠키에서 받은 원문 토큰을 auth_sessions.session_token_hash와 비교하기 위한 해시.
    비밀번호와 달리 세션 토큰은 이미 32바이트 CSPRNG 랜덤값이라 salt+느린 해시가 필요 없다
    (사전공격 대상이 될 만큼 추측 가능한 입력이 아님) — 조회 성능을 위해 SHA-256만 쓴다."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
