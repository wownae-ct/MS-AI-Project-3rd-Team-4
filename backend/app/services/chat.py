"""#20-22 실제 DB + RAG 로직. 03_API_spec.md §3, 05_RAG_design.md §2/§7.

stream_chat_response가 #22의 핵심이다. app/rag/graph.py의 그래프(retrieve→generate→verify)를
graph.astream(..., stream_mode=["custom", "values"])로 순회하는 얇은 래퍼다 — "custom" 청크는
generate_node가 get_stream_writer()로 흘려보낸 토큰이라 그대로 SSE token 이벤트로 전달하고,
"values" 청크는 매 노드가 끝날 때마다의 상태 스냅샷이라 마지막 것만 최종 answer/context/verdict로
쓴다. 그래프와 로직을 분리하지 않고 하나로 합친 이유: 예전엔 이 파일이 그래프를 거치지 않고
retrieve/generate/verify를 직접 재구현해서 app/rag/graph.py와 로직이 중복돼 있었다.

stream_chat_response는 라우터가 넘겨준 Depends(get_session) 세션을 쓰지 않고 자체적으로
get_session_factory()로 세션을 연다 — FastAPI는 StreamingResponse를 반환하는 라우터 함수가
"리턴"하는 즉시(스트리밍 바디가 실제로 소비되기 전에) yield 의존성을 정리한다(session.close()가
먼저 실행됨). 라우터가 주입한 세션을 제너레이터 안에서 계속 쓰면 요청 스코프 밖에서 커밋이
일어나는 셈이라, 직후 다른 요청이 같은 커넥션 풀에서 그 커밋을 못 보는 실제 버그로 이어졌다(실DB
회귀 검증 중 발견 — SSE로 메시지 저장까지 다 되는데 바로 이어지는 GET .../messages가 방금 저장한
답변을 못 읽음). 이 함수가 자기 완결적으로 세션을 열고 닫으면 이 레이스가 사라진다."""

import time
from collections.abc import AsyncIterator
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session_factory
from app.core.errors import api_error
from app.models import Category, ChatMessage, ChatSession, Wedding
from app.rag.graph import ChatState, build_graph
from app.schemas.chat import (
    ChatMessageCreate,
    CitationOut,
    CitationsEventData,
    DoneEventData,
    TokenEventData,
    VerificationEventData,
)

_GRAPH = build_graph()


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
    """SSE(Server-Sent Events) 한 줄을 만든다 — 브라우저가 이 정해진 포맷(event: 이름\\ndata:
    JSON\\n\\n)을 그대로 실시간 이벤트로 받아준다."""
    return f"event: {event}\ndata: {data.model_dump_json()}\n\n"


async def stream_chat_response(
    chat_session_id: UUID, payload: ChatMessageCreate
) -> AsyncIterator[str]:
    start = time.monotonic()

    async with get_session_factory()() as session:
        chat_session = await get_chat_session(session, chat_session_id)
        category = await session.get(Category, chat_session.category_id)

        session.add(ChatMessage(session_id=chat_session.id, role="user", content=payload.content))
        await session.commit()

        settings = get_settings()
        initial_state: ChatState = {
            "query": payload.content,
            "category_code": category.code,
            "context": [],
            "answer": "",
            "verdict": "",
            "verification_reason": "",
        }
        config = {"configurable": {"session": session, "settings": settings}}

        final_state: ChatState = initial_state
        # 그래프(retrieve→generate→verify)를 실시간으로 순회한다. 두 종류의 조각이 섞여서 나온다:
        #   - "custom": generate_node가 writer()로 흘려보낸 토큰 하나 → 곧바로 SSE로 전달(진짜 실시간)
        #   - "values": 노드가 하나 끝날 때마다의 "전체 상태 스냅샷" → 계속 덮어써서 마지막 것만 남김
        #     (retrieve 끝나면 context 채워진 스냅샷, verify 끝나면 verdict까지 채워진 스냅샷 순으로 옴)
        async for mode, chunk in _GRAPH.astream(
            initial_state, config, stream_mode=["custom", "values"]
        ):
            if mode == "custom":
                yield _sse("token", TokenEventData(delta=chunk["delta"]))
            else:
                final_state = chunk

        # 루프가 끝난 시점엔 final_state에 검색 근거(context)·최종 답변·검증 결과가 전부 들어있다.
        citations = [
            CitationOut(
                chunk_id=c.chunk_id,
                title=c.title,
                source_tier=c.source_tier,
                source_url=c.source_url,
            )
            for c in final_state["context"]
        ]
        yield _sse("citations", CitationsEventData(citations=citations))
        yield _sse(
            "verification",
            VerificationEventData(
                verdict=final_state["verdict"], reason=final_state["verification_reason"]
            ),
        )

        latency_ms = int((time.monotonic() - start) * 1000)
        assistant_message = ChatMessage(
            session_id=chat_session.id,
            role="assistant",
            content=final_state["answer"],
            citations=[c.model_dump() for c in citations],
            verification={
                "verdict": final_state["verdict"],
                "reason": final_state["verification_reason"],
            },
            latency_ms=latency_ms,
        )
        session.add(assistant_message)
        await session.commit()
        await session.refresh(assistant_message)

        yield _sse(
            "done", DoneEventData(message_id=str(assistant_message.id), latency_ms=latency_ms)
        )
