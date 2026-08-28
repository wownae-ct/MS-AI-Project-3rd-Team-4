"""#2-5 — 03_API_spec.md ⓪ 인증. signup/login/me 응답은 동일 스키마(AuthUserOut)."""

import re

from pydantic import UUID4 as UUID
from pydantic import BaseModel, EmailStr, Field, field_validator

# 프론트(frontend/src/pages/login/ui/validation.ts의 PASSWORD_PATTERN)가 이미 강제하는 조합
# 규칙을 서버에도 그대로 미러링한다(2026-08-26 레드팀 감사 대응) — 그 파일 주석이 명시하듯
# 프론트만 막고 있어 API를 직접 호출하면 조합 없는 비밀번호도 여전히 통과했었다. pydantic-core의
# Field(pattern=...)는 Rust regex 엔진이라 lookahead를 지원 안 해 field_validator+re로 검사한다.
_PASSWORD_PATTERN = re.compile(r"^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$")
_PASSWORD_POLICY_ERROR = "비밀번호는 영문·숫자·특수문자를 모두 포함해 8자 이상이어야 합니다."


def _normalize_email(value: str) -> str:
    """이메일 로컬파트도 대소문자 구분 없이 취급한다 — 안 그러면 가입 시 대문자가 섞인
    이메일로 만든 계정이 로그인 때 소문자로 입력하면 401이 난다(2026-08-26 레드팀 감사 대응)."""
    return value.strip().lower()


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str

    _normalize_email = field_validator("email")(_normalize_email)

    @field_validator("password")
    @classmethod
    def _check_password_policy(cls, value: str) -> str:
        if not _PASSWORD_PATTERN.match(value):
            raise ValueError(_PASSWORD_POLICY_ERROR)
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    _normalize_email = field_validator("email")(_normalize_email)


class AuthUserOut(BaseModel):
    id: UUID
    email: str
    display_name: str | None
    has_wedding: bool

    model_config = {"from_attributes": True}
