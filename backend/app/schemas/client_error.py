"""신규(2026-08-26) — 03_API_spec.md 미기재, 프론트 레드팀 감사 4라운드(로깅/관측성) 후속으로
백엔드에 추가. 프론트 ErrorBoundary.onError가 렌더 크래시를 원격으로 보고할 때 쓰는 바디."""

from pydantic import BaseModel, Field

CLIENT_ERROR_MESSAGE_MAX_LENGTH = 2000
CLIENT_ERROR_STACK_MAX_LENGTH = 8000
CLIENT_ERROR_URL_MAX_LENGTH = 2000
CLIENT_ERROR_USER_AGENT_MAX_LENGTH = 500


class ClientErrorReportCreate(BaseModel):
    message: str = Field(min_length=1, max_length=CLIENT_ERROR_MESSAGE_MAX_LENGTH)
    stack: str | None = Field(default=None, max_length=CLIENT_ERROR_STACK_MAX_LENGTH)
    component_stack: str | None = Field(default=None, max_length=CLIENT_ERROR_STACK_MAX_LENGTH)
    url: str = Field(min_length=1, max_length=CLIENT_ERROR_URL_MAX_LENGTH)
    user_agent: str | None = Field(default=None, max_length=CLIENT_ERROR_USER_AGENT_MAX_LENGTH)
