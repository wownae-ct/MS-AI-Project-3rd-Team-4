"""#20-22 — 03_API_spec.md §3. 상담 세션 생성/이력 조회, SSE 스트리밍 답변.

09_backend_implementation_plan.md Phase 1 범위 — 전부 목 응답. #22는 app.rag.graph 실제 구현
(Phase 3/4) 전까지 05_RAG_design.md §7 이벤트 계약(token*→citations→verification→done)을
그대로 흉내낸 고정 SSE 스트림을 내려준다 — 프론트가 fetch+ReadableStream 파싱을 RAG 없이도
미리 검증할 수 있게 하는 게 목적."""

from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.schemas.chat import (
    ChatMessageCreate,
    ChatMessageListOut,
    ChatMessageOut,
    ChatSessionCreate,
    ChatSessionOut,
    CitationOut,
    CitationsEventData,
    DoneEventData,
    TokenEventData,
    VerificationEventData,
    VerificationOut,
)

router = APIRouter(tags=["chat"])

_MOCK_SESSION_ID = UUID("e1f2a3b4-0000-4000-8000-000000000001")
_MOCK_CITATION = CitationOut(
    chunk_id=12,
    title="표준계약서 제9조",
    source_tier="OFFICIAL",
    source_url="https://www.korea.kr/briefing/pressReleaseView.do?newsId=156682367",
)


@router.post("/chat/sessions", response_model=ChatSessionOut, status_code=201)
async def create_chat_session(payload: ChatSessionCreate) -> ChatSessionOut:
    return ChatSessionOut(
        id=_MOCK_SESSION_ID,
        category_code=payload.category_code,
        title=None,
        created_at=datetime.now(UTC),
    )


@router.get("/chat/sessions/{session_id}/messages", response_model=ChatMessageListOut)
async def list_chat_messages(session_id: str) -> ChatMessageListOut:
    now = datetime.now(UTC)
    return ChatMessageListOut(
        messages=[
            ChatMessageOut(
                id="msg1", role="user", content="위약금 조건 어떻게 확인해요?", created_at=now
            ),
            ChatMessageOut(
                id="msg2",
                role="assistant",
                content="위약금 관련해서는 두 가지를 확인하세요. 표준계약서 제9조에 따르면...",
                citations=[_MOCK_CITATION],
                verification=VerificationOut(verdict="SUPPORTED", reason="표준계약서 원문과 일치"),
                created_at=now,
            ),
        ]
    )


def _sse(event: str, data: BaseModel) -> str:
    return f"event: {event}\ndata: {data.model_dump_json()}\n\n"


async def _mock_chat_stream() -> AsyncIterator[str]:
    tokens = [
        "위약금 관련해서는 ",
        "두 가지를 확인하세요. ",
        "표준계약서 제9조에 따르면 위약금은 총 대행요금의 10%를 넘을 수 없습니다.",
    ]
    for token in tokens:
        yield _sse("token", TokenEventData(delta=token))
    yield _sse("citations", CitationsEventData(citations=[_MOCK_CITATION]))
    yield _sse(
        "verification", VerificationEventData(verdict="SUPPORTED", reason="표준계약서 원문과 일치")
    )
    yield _sse("done", DoneEventData(message_id=str(uuid4()), latency_ms=830))


@router.post("/chat/sessions/{session_id}/messages")
async def send_chat_message(session_id: str, payload: ChatMessageCreate) -> StreamingResponse:
    return StreamingResponse(
        _mock_chat_stream(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"},
    )
