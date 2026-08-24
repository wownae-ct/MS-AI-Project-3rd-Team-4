"""#20-22 — 03_API_spec.md §3. 상담 세션/메시지 이력, #22 SSE 스트리밍 이벤트 페이로드."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import CategoryCode, ChatRole, ChatStage, SourceTier, Verdict


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
    created_at: datetime


class ChatMessageListOut(BaseModel):
    messages: list[ChatMessageOut]


class ChatMessageCreate(BaseModel):
    content: str


# --- #22 SSE 이벤트 데이터 페이로드 (05_RAG_design.md §7) ---


class TokenEventData(BaseModel):
    delta: str


class StageEventData(BaseModel):
    """그래프(retrieve→generate→verify) 노드 진입 시점마다 오는 진행 단계 알림 — 최종 결과
    (answer/context/verdict)엔 영향 없는 순수 UX용 이벤트라, 프론트가 이 이벤트를 무시해도
    token/citations/verification/done은 그대로 온다."""

    stage: ChatStage


class RetryEventData(BaseModel):
    """CRAG 조건부 재검색 루프(2026-08-24 결정, app/rag/graph.py) — verify가 WEAK/GENERAL
    판정을 내려 재구성된 질의로 retrieve를 다시 돌 때 딱 한 번(최대 1회) 발생한다. 이 이벤트를
    받으면 그 시점까지 스트리밍된 답변(token 누적분)은 버리고 새로 시작해야 한다 — 뒤이어 오는
    token들은 새 답변의 처음부터다. 완전 additive라 무시해도 기존 token/citations/verification/
    done 흐름은 깨지지 않는다(재시도 시 1차+2차 답변이 이어붙어 보이는 어색함만 생김)."""

    reason: str


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
