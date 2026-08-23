"""#20-22 — 03_API_spec.md §3. 상담 세션/메시지 이력, #22 SSE 스트리밍 이벤트 페이로드."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import CategoryCode, ChatRole, SourceTier, Verdict


class ChatSessionCreate(BaseModel):
    category_code: CategoryCode


class ChatSessionOut(BaseModel):
    id: UUID
    category_code: CategoryCode
    title: str | None
    created_at: datetime


class CitationOut(BaseModel):
    chunk_id: int
    title: str
    source_tier: SourceTier
    # 팀 자체 저작 콘텐츠(DS6_CHECK 등)는 원문 출처 URL이 없다 — nullable(2026-08-21 실제 데이터로 확인).
    source_url: str | None


class VerificationOut(BaseModel):
    verdict: Verdict
    reason: str


class ChatMessageOut(BaseModel):
    id: str
    role: ChatRole
    content: str
    citations: list[CitationOut] | None = None
    verification: VerificationOut | None = None
    created_at: datetime


class ChatMessageListOut(BaseModel):
    messages: list[ChatMessageOut]


class ChatMessageCreate(BaseModel):
    content: str


# --- #22 SSE 이벤트 데이터 페이로드 (05_RAG_design.md §7) ---


class TokenEventData(BaseModel):
    delta: str


class CitationsEventData(BaseModel):
    citations: list[CitationOut]


class VerificationEventData(BaseModel):
    verdict: Verdict
    reason: str


class DoneEventData(BaseModel):
    message_id: str
    latency_ms: int


class ErrorEventData(BaseModel):
    """03_API_spec.md #29 "에러 시" / 05_RAG_design.md §10 — Azure OpenAI 429·타임아웃 등으로
    스트림 중간에 실패하면 HTTP 상태코드를 더 이상 바꿀 수 없어(이미 200 스트림 시작) 이 이벤트로
    대신 알린다."""

    code: str
    message: str
