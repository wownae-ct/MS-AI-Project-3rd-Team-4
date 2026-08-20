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
    source_url: str


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
