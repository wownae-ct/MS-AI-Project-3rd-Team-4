"""#20-22 — 03_API_spec.md §3. 상담 세션 생성/이력 조회, SSE 스트리밍 답변.

09_backend_implementation_plan.md Phase 3/4 — app.rag.graph/retrieval 실구현에 맞춰 실제 DB +
RAG 로직(app/services/chat.py)으로 교체 완료. 05_RAG_design.md §7 이벤트 계약
(token*→citations→verification→done)을 실제로 만족한다.

이 파일의 모든 엔드포인트가 예외 없이 get_current_wedding을 거쳐 wedding_id를 서비스 레이어까지
넘긴다 — 이전에는 목록/전송 두 엔드포인트에 이 의존성이 아예 빠져 있어 세션 UUID만 알면 누구나
남의 상담 기록을 읽고 프로젝트 Azure OpenAI 비용으로 메시지를 보낼 수 있었다(2026-08-24
chat_sessions v4.0 재구현 중 발견). 엔드포인트를 새로 추가할 때도 이 규칙은 그대로다."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.rate_limit import limiter, user_or_ip_key
from app.deps import get_current_wedding
from app.models import ChatMessage, Wedding
from app.schemas.chat import (
    ChatMessageCreate,
    ChatMessageListOut,
    ChatMessageOut,
    ChatMessageRatingCreate,
    ChatMessageRatingOut,
    ChatSessionCreate,
    ChatSessionListOut,
    ChatSessionOut,
    ChatSessionSummaryOut,
    CitationOut,
    VerificationOut,
)
from app.services.chat import (
    create_chat_session as create_chat_session_service,
)
from app.services.chat import (
    delete_chat_session,
    get_chat_session,
    list_chat_messages,
    list_chat_sessions,
    rate_chat_message,
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
        user_rating=message.user_rating,
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


@router.get("/chat/sessions", response_model=ChatSessionListOut)
async def list_chat_sessions_route(
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> ChatSessionListOut:
    sessions = await list_chat_sessions(session, wedding.id)
    return ChatSessionListOut(
        sessions=[
            ChatSessionSummaryOut(
                id=s.id,
                category_code=s.category_code,
                title=s.title,
                last_message_at=s.last_message_at,
                created_at=s.created_at,
            )
            for s in sessions
        ]
    )


@router.get("/chat/sessions/{session_id}/messages", response_model=ChatMessageListOut)
async def list_chat_messages_route(
    session_id: UUID,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> ChatMessageListOut:
    messages = await list_chat_messages(session, wedding.id, session_id)
    return ChatMessageListOut(messages=[_message_to_out(m) for m in messages])


@router.delete("/chat/sessions/{session_id}", status_code=204)
# rate limit을 안 거는 이유: LLM 호출이 없어 비용이 안 들고, 같은 성격의 선례인
# DELETE /payments/{id}(app/routers/wedding/budget.py)도 안 걸려 있다.
async def delete_chat_session_route(
    session_id: UUID,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> None:
    await delete_chat_session(session, wedding.id, session_id)


@router.post("/chat/sessions/{session_id}/messages")
@limiter.limit("20/minute", key_func=user_or_ip_key)
# 17_qa_e2e_test_plan.md §10-2/§14-2 — 메시지당 RAG LLM 호출 1회 이상(CRAG 재시도 시 최대 2회).
# 실사용 다중 메시지 흐름을 고려해 create_wedding/regenerate보다 여유 있게 잡음.
async def send_chat_message(
    request: Request,
    session_id: UUID,
    payload: ChatMessageCreate,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> StreamingResponse:
    await get_chat_session(session, wedding.id, session_id)  # 존재/소유 아니면 스트림 전 404
    return StreamingResponse(
        stream_chat_response(
            session_id, wedding.id, owner_user_id=wedding.owner_user_id, payload=payload
        ),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"},
    )


@router.post(
    "/chat/sessions/{session_id}/messages/{message_id}/feedback",
    response_model=ChatMessageRatingOut,
)
async def rate_chat_message_route(
    session_id: UUID,
    message_id: UUID,
    payload: ChatMessageRatingCreate,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> ChatMessageRatingOut:
    message = await rate_chat_message(session, wedding.id, session_id, message_id, payload.rating)
    return ChatMessageRatingOut(message_id=str(message.id), rating=message.user_rating)
