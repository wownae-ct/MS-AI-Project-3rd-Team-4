"""#2-5 — 03_API_spec.md ⓪ 인증. signup/login/me 응답은 동일 스키마(AuthUserOut)."""

from pydantic import UUID4 as UUID
from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    # 비밀번호 정책: 최소 8자 — 03_API_spec.md는 "정책 미달 시 VALIDATION_ERROR"라고만 하고
    # 정확한 규칙을 안 못박아서, OWASP 최소 권고치인 8자를 하한으로 잡는다(2026-08-24).
    password: str = Field(min_length=8)
    display_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthUserOut(BaseModel):
    id: UUID
    email: str
    display_name: str | None
    has_wedding: bool

    model_config = {"from_attributes": True}
