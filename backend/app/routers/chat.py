"""#20-22 — 03_API_spec.md §3. 상담 세션 생성/이력 조회, SSE 스트리밍 답변.

09_backend_implementation_plan.md Phase 3/4 — app.rag.graph/retrieval 실구현에 맞춰 실제 DB +
RAG 로직(app/services/chat.py)으로 교체 완료. 05_RAG_design.md §7 이벤트 계약
(token*→citations→verification→done)을 실제로 만족한다.

세 엔드포인트 모두 get_current_wedding을 거쳐 wedding_id를 서비스 레이어까지 넘긴다 — 이전에는
목록/전송 두 엔드포인트에 이 의존성이 아예 빠져 있어 세션 UUID만 알면 누구나 남의 상담 기록을
읽고 프로젝트 Azure OpenAI 비용으로 메시지를 보낼 수 있었다(2026-08-24 chat_sessions v4.0
재구현 중 발견)."""

from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.deps import get_current_wedding
from app.models import ChatMessage, Wedding
from app.schemas.chat import (
    ChatMessageCreate,
    ChatMessageListOut,
    ChatMessageOut,
    ChatSessionCreate,
    ChatSessionOut,
    CitationOut,
    VerificationOut,
)
from app.services.chat import (
    create_chat_session as create_chat_session_service,
)
from app.services.chat import (
    get_chat_session,
    list_chat_messages,
    stream_chat_response,
)

router = APIRouter(tags=["chat"])


def _message_to_out(message: ChatMessage) -> ChatMessageOut:
    return ChatMessageOut(
        id=str(message.id),
        role=message.role,
        content=message.content,
        citations=[CitationOut(**c) for c in message.citations] if message.citations else None,
        verification=VerificationOut(**message.verification) if message.verification else None,
        created_at=message.created_at,
    )


@router.post("/chat/sessions", response_model=ChatSessionOut, status_code=201)
async def create_chat_session(
    payload: ChatSessionCreate,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> ChatSessionOut:
    chat_session = await create_chat_session_service(session, wedding, payload.category_code)
    return ChatSessionOut(
        id=chat_session.id,
        category_code=chat_session.category_code,
        title=chat_session.title,
        created_at=chat_session.created_at,
    )


@router.get("/chat/sessions/{session_id}/messages", response_model=ChatMessageListOut)
async def list_chat_messages_route(
    session_id: UUID,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> ChatMessageListOut:
    messages = await list_chat_messages(session, wedding.id, session_id)
    return ChatMessageListOut(messages=[_message_to_out(m) for m in messages])


@router.post("/chat/sessions/{session_id}/messages")
async def send_chat_message(
    session_id: UUID,
    payload: ChatMessageCreate,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> StreamingResponse:
    await get_chat_session(session, wedding.id, session_id)  # 존재/소유 아니면 스트림 전 404
    return StreamingResponse(
        stream_chat_response(session_id, wedding.id, payload),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"},
    )
