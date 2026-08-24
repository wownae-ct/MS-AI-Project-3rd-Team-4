"""#20-22 — 03_API_spec.md §3. 상담 세션/메시지 이력, #22 SSE 스트리밍 이벤트 페이로드."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import CategoryCode, ChatRating, ChatRole, SourceTier, Verdict


class ChatSessionCreate(BaseModel):
    # 12_final_prototype_mockup.html 하단 탭바의 전역 "AI상담"(카테고리 무관)과 카테고리 상세
    # 안의 "AI상담" 서브탭 둘 다 이 엔드포인트로 세션을 만든다 — None이면 전역 상담.
    # ChatSession.category_code(app/models/chat.py)가 이미 nullable로 설계돼 있던 걸 반영.
    category_code: CategoryCode | None = None


class ChatSessionOut(BaseModel):
    id: UUID
    category_code: CategoryCode | None
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
    user_rating: ChatRating | None = None
    created_at: datetime


class ChatMessageListOut(BaseModel):
    messages: list[ChatMessageOut]


class ChatMessageCreate(BaseModel):
    content: str


class ChatMessageRatingCreate(BaseModel):
    rating: ChatRating


class ChatMessageRatingOut(BaseModel):
    message_id: str
    rating: ChatRating


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
