"""#20-22 실제 DB + RAG 로직. 03_API_spec.md §3, 05_RAG_design.md §2/§7.

stream_chat_response가 #22의 핵심이다 — retrieve → (0건이면 고정 안내, 아니면 스트리밍 생성) →
verify 순서로 실행하며, 매 단계 결과를 SSE 이벤트로 즉시 흘려보낸다. 그래프(app/rag/graph.py)를
거치지 않고 여기서 직접 orchestrate하는 이유는 실시간 토큰 스트리밍이 필요해서다(같은 파일
docstring 참고)."""

import time
from collections.abc import AsyncIterator
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.embeddings import get_azure_openai_client
from app.core.errors import api_error
from app.models import Category, ChatMessage, ChatSession, Wedding
from app.rag.generation import (
    NO_CONTEXT_ANSWER,
    NO_CONTEXT_REASON,
    build_chat_messages,
    verify_answer,
)
from app.rag.retrieval import retrieve
from app.schemas.chat import (
    ChatMessageCreate,
    CitationOut,
    CitationsEventData,
    DoneEventData,
    TokenEventData,
    VerificationEventData,
)


async def create_chat_session(
    session: AsyncSession, wedding: Wedding, category_code: str
) -> ChatSession:
    category = (
        await session.execute(select(Category).where(Category.code == category_code))
    ).scalar_one()
    chat_session = ChatSession(wedding_id=wedding.id, category_id=category.id)
    session.add(chat_session)
    await session.commit()
    await session.refresh(chat_session)
    return chat_session


async def get_chat_session(session: AsyncSession, session_id: UUID) -> ChatSession:
    chat_session = await session.get(ChatSession, session_id)
    if chat_session is None:
        raise api_error(404, "CHAT_SESSION_NOT_FOUND", "상담 세션을 찾을 수 없습니다.")
    return chat_session


async def list_chat_messages(session: AsyncSession, session_id: UUID) -> list[ChatMessage]:
    result = await session.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    return list(result.scalars().all())


def _sse(event: str, data: BaseModel) -> str:
    return f"event: {event}\ndata: {data.model_dump_json()}\n\n"


async def stream_chat_response(
    session: AsyncSession, chat_session: ChatSession, payload: ChatMessageCreate
) -> AsyncIterator[str]:
    start = time.monotonic()
    category = await session.get(Category, chat_session.category_id)

    session.add(ChatMessage(session_id=chat_session.id, role="user", content=payload.content))
    await session.commit()

    settings = get_settings()
    chunks = await retrieve(session, payload.content, category.code, settings)

    if not chunks:
        answer = NO_CONTEXT_ANSWER
        citations: list[CitationOut] = []
        verdict, reason = "GENERAL", NO_CONTEXT_REASON
        yield _sse("token", TokenEventData(delta=answer))
    else:
        client = get_azure_openai_client(settings)
        stream = await client.chat.completions.create(
            model=settings.azure_openai_chat_deployment,
            messages=build_chat_messages(category.code, chunks, payload.content),
            stream=True,
        )
        answer_parts: list[str] = []
        async for event in stream:
            delta = event.choices[0].delta.content if event.choices else None
            if delta:
                answer_parts.append(delta)
                yield _sse("token", TokenEventData(delta=delta))
        answer = "".join(answer_parts)

        citations = [
            CitationOut(
                chunk_id=c.chunk_id,
                title=c.title,
                source_tier=c.source_tier,
                source_url=c.source_url,
            )
            for c in chunks
        ]
        verdict, reason = await verify_answer(client, settings, chunks, answer)

    yield _sse("citations", CitationsEventData(citations=citations))
    yield _sse("verification", VerificationEventData(verdict=verdict, reason=reason))

    latency_ms = int((time.monotonic() - start) * 1000)
    assistant_message = ChatMessage(
        session_id=chat_session.id,
        role="assistant",
        content=answer,
        citations=[c.model_dump() for c in citations],
        verification={"verdict": verdict, "reason": reason},
        latency_ms=latency_ms,
    )
    session.add(assistant_message)
    await session.commit()
    await session.refresh(assistant_message)

    yield _sse("done", DoneEventData(message_id=str(assistant_message.id), latency_ms=latency_ms))
