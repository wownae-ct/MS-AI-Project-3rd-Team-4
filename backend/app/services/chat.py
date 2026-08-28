"""#20-22 실제 DB + RAG 로직. 03_API_spec.md §3, 05_RAG_design.md §2/§7.

stream_chat_response가 #22의 핵심이다. app/rag/graph.py의 그래프(retrieve→generate→verify,
verify가 WEAK/GENERAL이면 최대 1회 retrieve로 되돌아가는 CRAG 조건부 루프 포함)를
graph.astream(..., stream_mode=["custom", "values"])로 순회하는 얇은 래퍼다 — "custom" 청크는
세 노드가 get_stream_writer()로 흘려보낸 것으로, chunk["type"]에 따라 "token"(델타 텍스트,
SSE token 이벤트), "stage"(노드 진입 알림, SSE stage 이벤트), "retry"(재검색 시작 알림, SSE
retry 이벤트, 최대 1회), "heartbeat"(verify/reformulate_query 대기 중 침묵 방지용, SSE 주석
줄 — 2026-08-26, app/rag/graph.py::_await_with_heartbeat) 넷으로 나뉜다. "values" 청크는
매 노드가 끝날 때마다의 상태 스냅샷이라
마지막 것만 최종 answer/context/verdict로 쓴다 — 재검색이 일어나도 이 방식은 자동으로 "마지막
시도" 결과만 남긴다(따로 처리 불필요). 그래프와 로직을 분리하지 않고 하나로 합친 이유: 예전엔
이 파일이 그래프를 거치지 않고 retrieve/generate/verify를 직접 재구현해서 app/rag/graph.py와
로직이 중복돼 있었다.

stream_chat_response는 라우터가 넘겨준 Depends(get_session) 세션을 쓰지 않고 자체적으로
get_session_factory()로 세션을 연다 — FastAPI는 StreamingResponse를 반환하는 라우터 함수가
"리턴"하는 즉시(스트리밍 바디가 실제로 소비되기 전에) yield 의존성을 정리한다(session.close()가
먼저 실행됨). 라우터가 주입한 세션을 제너레이터 안에서 계속 쓰면 요청 스코프 밖에서 커밋이
일어나는 셈이라, 직후 다른 요청이 같은 커넥션 풀에서 그 커밋을 못 보는 실제 버그로 이어졌다(실DB
회귀 검증 중 발견 — SSE로 메시지 저장까지 다 되는데 바로 이어지는 GET .../messages가 방금 저장한
답변을 못 읽음). 이 함수가 자기 완결적으로 세션을 열고 닫으면 이 레이스가 사라진다."""

import logging
import time
from collections.abc import AsyncIterator
from uuid import UUID

from openai import RateLimitError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session_factory
from app.core.errors import api_error
from app.core.sse import sse_comment as _sse_comment
from app.core.sse import sse_event as _sse
from app.core.tracing import score_trace, traced_span
from app.models import ChatMessage, ChatSession, Wedding
from app.rag.graph import ChatState, build_graph
from app.rag.query_profile import profile_query
from app.rag.scope_check import OUT_OF_SCOPE_ANSWER, OUT_OF_SCOPE_REASON, looks_out_of_scope
from app.schemas.chat import (
    ChatMessageCreate,
    CitationOut,
    CitationsEventData,
    DoneEventData,
    ErrorEventData,
    RetryEventData,
    StageEventData,
    TokenEventData,
    VerificationEventData,
)

logger = logging.getLogger(__name__)

_GRAPH = build_graph()


async def create_chat_session(
    session: AsyncSession, wedding: Wedding, category_code: str | None
) -> ChatSession:
    chat_session = ChatSession(wedding_id=wedding.id, category_code=category_code)
    session.add(chat_session)
    await session.commit()
    await session.refresh(chat_session)
    return chat_session


async def get_chat_session(
    session: AsyncSession, wedding_id: UUID, session_id: UUID
) -> ChatSession:
    """wedding_id를 WHERE 절에 직접 넣어 "없음"과 "남의 것"을 구조적으로 구분 못 하게 한다 —
    둘 다 404 CHAT_SESSION_NOT_FOUND로 응답해 세션 존재 여부 자체를 노출하지 않는다
    (03_API_spec.md §5 — 다른 사람의 리소스를 조회/수정할 방법 자체가 없어야 함)."""
    stmt = select(ChatSession).where(
        ChatSession.id == session_id, ChatSession.wedding_id == wedding_id
    )
    chat_session = (await session.execute(stmt)).scalar_one_or_none()
    if chat_session is None:
        raise api_error(404, "CHAT_SESSION_NOT_FOUND", "상담 세션을 찾을 수 없습니다.")
    return chat_session


async def get_chat_message(
    session: AsyncSession, wedding_id: UUID, session_id: UUID, message_id: UUID
) -> ChatMessage:
    """get_chat_session과 같은 원칙 — 메시지 id / 그 메시지가 속한 세션 / 그 세션의 웨딩 셋 다
    WHERE에 넣어 "없음"·"다른 세션 소속"·"남의 것"을 응답에서 구분 못 하게 한다. chat_messages에는
    wedding_id가 없어 chat_sessions 조인이 필요하다(app/services/feedback.py::
    target_exists_for_wedding의 CHAT_MESSAGE 분기와 동일한 조인)."""
    stmt = (
        select(ChatMessage)
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(
            ChatMessage.id == message_id,
            ChatMessage.session_id == session_id,
            ChatSession.wedding_id == wedding_id,
        )
    )
    message = (await session.execute(stmt)).scalar_one_or_none()
    if message is None:
        raise api_error(404, "CHAT_MESSAGE_NOT_FOUND", "상담 메시지를 찾을 수 없습니다.")
    return message


# Langfuse BOOLEAN 스코어는 0/1 수치로 저장되고 UI에서 true/false로 렌더링된다 — GOOD/BAD 이분
# 신호에 정확히 대응하고, 평균이 그대로 "GOOD 비율"이 된다. 5점 척도가 필요해지면 그때
# data_type="NUMERIC"으로 바꾼다(지금 필요 없음 — YAGNI).
_RATING_SCORE_NAME = "user_rating"
_RATING_SCORE_VALUES: dict[str, float] = {"GOOD": 1.0, "BAD": 0.0}


async def rate_chat_message(
    session: AsyncSession, wedding_id: UUID, session_id: UUID, message_id: UUID, rating: str
) -> ChatMessage:
    """DB 저장이 먼저, Langfuse 전송이 나중 — 전송 실패가 사용자 평가를 되돌리면 안 된다.
    trace_ref가 없는 메시지(트레이싱 off 상태에서 생성됐거나 마이그레이션 이전 행)는 DB에만
    저장하고 조용히 넘어간다."""
    message = await get_chat_message(session, wedding_id, session_id, message_id)
    if message.role != "assistant":
        raise api_error(
            400, "CHAT_MESSAGE_NOT_RATABLE", "AI 답변 메시지에만 평가를 남길 수 있습니다."
        )

    message.user_rating = rating
    await session.commit()
    await session.refresh(message)

    if message.trace_ref:
        score_trace(
            message.trace_ref,
            name=_RATING_SCORE_NAME,
            value=_RATING_SCORE_VALUES[rating],
            score_id=f"{_RATING_SCORE_NAME}-{message.id}",
        )
    return message


async def list_chat_messages(
    session: AsyncSession, wedding_id: UUID, session_id: UUID
) -> list[ChatMessage]:
    await get_chat_session(session, wedding_id, session_id)  # 소유권 확인 — 아니면 404
    result = await session.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    return list(result.scalars().all())


def _build_citations(context: list) -> list[CitationOut]:
    return [
        CitationOut(
            chunk_id=c.chunk_id, title=c.title, source_tier=c.source_tier, source_url=c.source_url
        )
        for c in context
    ]


# 2026-08-26 레드팀 감사 3라운드 MEDIUM #10 — 다른 에러 경로(예: app/services/oauth.py의
# UPSTREAM_LLM_ERROR)는 전부 정제된 한국어 문구를 쓰는데, 여기만 openai SDK 원본 예외 문자열을
# 그대로 SSE로 노출했다. 원인 진단용 상세는 trace.update(metadata=...)의 error_detail로만 남긴다.
_RATE_LIMITED_MESSAGE = "지금 요청이 많아 답변 생성이 지연되고 있습니다. 잠시 후 다시 시도해주세요."
_UPSTREAM_LLM_ERROR_MESSAGE = (
    "일시적인 오류로 답변을 완성하지 못했습니다. 잠시 후 다시 시도해주세요."
)


async def _finish_after_upstream_failure(
    session: AsyncSession,
    chat_session: ChatSession,
    final_state: ChatState,
    trace,
    span_metadata: dict,
    start: float,
    error_code: str,
    error_detail: str,
) -> AsyncIterator[str]:
    """2026-08-26 레드팀 감사 3라운드 HIGH #2/MEDIUM #11 — generate_node가 이미 답변을 만들어
    SSE token으로 사용자에게 스트리밍한 뒤(예: verify 또는 CRAG 재시도 단계에서 Azure OpenAI가
    429/타임아웃으로 실패하면), 그 답변을 DB에도 Langfuse trace에도 전혀 못 남기고 사라졌다 —
    astream 루프의 except가 바로 return해서 뒤쪽 커밋/trace.update 코드에 아예 안 갔기 때문.
    final_state에 answer가 남아있는 한(=generate가 최소 한 번은 성공) 그 결과를 최선으로
    저장한다 — 완전히 잃어버리는 것보다, verdict 미검증 상태로라도 남기는 편이 낫다."""
    answer = final_state.get("answer") or ""
    verdict = final_state.get("verdict") or "GENERAL"
    reason = final_state.get("verification_reason") or "업스트림 오류로 근거 검증을 완료하지 못함"
    trace.update(
        output=answer or None,
        metadata={
            **span_metadata,
            "verdict": verdict,
            "retry_count": final_state.get("retry_count", 0),
            "error_code": error_code,
            "error_detail": error_detail,
        },
    )
    if answer:
        citations = _build_citations(final_state.get("context") or [])
        latency_ms = int((time.monotonic() - start) * 1000)
        assistant_message = ChatMessage(
            session_id=chat_session.id,
            role="assistant",
            content=answer,
            citations=[c.model_dump() for c in citations],
            verification={"verdict": verdict, "reason": reason},
            latency_ms=latency_ms,
            trace_ref=trace.trace_id,
        )
        session.add(assistant_message)
        await session.commit()
        yield _sse("citations", CitationsEventData(citations=citations))
        yield _sse("verification", VerificationEventData(verdict=verdict, reason=reason))
    error_message = (
        _RATE_LIMITED_MESSAGE if error_code == "RATE_LIMITED" else _UPSTREAM_LLM_ERROR_MESSAGE
    )
    yield _sse("error", ErrorEventData(code=error_code, message=error_message))


async def stream_chat_response(
    chat_session_id: UUID,
    wedding_id: UUID,
    owner_user_id: UUID,
    payload: ChatMessageCreate,
) -> AsyncIterator[str]:
    start = time.monotonic()

    async with get_session_factory()() as session:
        chat_session = await get_chat_session(session, wedding_id, chat_session_id)

        session.add(ChatMessage(session_id=chat_session.id, role="user", content=payload.content))
        await session.commit()

        settings = get_settings()
        initial_state: ChatState = {
            "query": payload.content,
            "category_code": chat_session.category_code,
            "context": [],
            "answer": "",
            "verdict": "",
            "verification_reason": "",
            "retry_count": 0,
        }
        config = {"configurable": {"session": session, "settings": settings}}

        final_state: ChatState = initial_state
        # metadata를 변수로 뽑아두는 이유: 아래 trace.update(metadata=...)가 생성 시점 metadata를
        # 덮어쓸지 병합할지 SDK 구현에 기대지 않고, 명시적으로 합쳐 보내면 어느 쪽이든 유실이
        # 없다. tags는 app/rag/query_profile.py의 질의 품질 리스크 분류(short_query 등)를
        # 트레이스 레벨에 붙여 목록에서 필터링할 수 있게 한다(chat.retrieve 자식 span엔 굳이
        # 다시 안 넘김 — 컨텍스트 전파로 이미 상속됨, app/core/tracing.py::traced_span 참고).
        query_profile = profile_query(payload.content)
        span_metadata = {
            "category_code": chat_session.category_code or "ALL",
            **query_profile.as_metadata(),
        }
        # 2026-08-29 — 스코프 이탈 차단(app/rag/scope_check.py). 결혼 준비와 무관한 요청이면
        # retrieve/generate/verify(임베딩 API 1회+DB 왕복+LLM 2회)를 아예 안 태우고 즉시
        # 고정 거절 답변으로 끝낸다. RAG 근거검증 가드레일(verify_node)과 별개 레이어라 그래프
        # 자체는 안 건드리고, 그래프 호출 직전 서비스 레이어에서만 분기한다 — 실측 결과 기존
        # "검색 결과 0건 → 거절" 경로가 벡터 검색에 유사도 임계값이 없어 사실상 거의 발동하지
        # 않았고, 프롬프트 규칙만으로는 태스크성 무관 요청("소설 써줘")이 새는 게 확인됐다.
        out_of_scope = looks_out_of_scope(payload.content)
        async with traced_span(
            "chat",
            settings=settings,
            input=payload.content,
            metadata=span_metadata,
            session_id=str(chat_session.id),
            user_id=str(
                owner_user_id
            ),  # 이메일 등 PII 대신 UUID만 전달(personalization.py와 동일 원칙)
            tags=list(query_profile.tags),
        ) as trace:
            if out_of_scope:
                # 2026-08-29 — 처음엔 "검색 결과 0건"(app/rag/generation.py::NO_CONTEXT_ANSWER)
                # 경로와 같은 모양(context=[], verdict=GENERAL)의 final_state로 GENERAL을
                # 재사용했으나(red-bug.md #15 "프론트 후속 작업"), "근거가 없다"와 "질문 자체를
                # 거절했다"는 서로 다른 상황이라 배지 문구가 부정확했다 — 전용 verdict
                # "OUT_OF_SCOPE"를 신설(app/schemas/common.py의 Verdict Literal)해 구분한다.
                final_state = {
                    **initial_state,
                    "answer": OUT_OF_SCOPE_ANSWER,
                    "verdict": "OUT_OF_SCOPE",
                    "verification_reason": OUT_OF_SCOPE_REASON,
                }
                yield _sse("token", TokenEventData(delta=OUT_OF_SCOPE_ANSWER))
            else:
                try:
                    # 그래프(retrieve→generate→verify, verify→retrieve 조건부 재검색 포함)를
                    # 실시간으로 순회한다. 두 종류의 조각이 섞여서 나온다:
                    #   - "custom": 노드가 writer()로 흘려보낸 것 — type="token"이면 델타 하나
                    #     (진짜 실시간), type="stage"면 노드 진입 알림(3부: 검색/생성/검증 중),
                    #     type="retry"면 재검색 시작 알림(최대 1회, retrieve_node가 재시도
                    #     감지 시 stage보다 먼저 emit)
                    #   - "values": 노드가 하나 끝날 때마다의 "전체 상태 스냅샷" → 계속 덮어써서
                    #     마지막 것만 남김(재검색이 일어나도 마지막 시도 결과만 자동으로 남음)
                    async for mode, chunk in _GRAPH.astream(
                        initial_state, config, stream_mode=["custom", "values"]
                    ):
                        if mode == "custom":
                            if chunk["type"] == "token":
                                yield _sse("token", TokenEventData(delta=chunk["delta"]))
                            elif chunk["type"] == "stage":
                                yield _sse("stage", StageEventData(stage=chunk["stage"]))
                            elif chunk["type"] == "retry":
                                yield _sse("retry", RetryEventData(reason=chunk["reason"]))
                            elif chunk["type"] == "heartbeat":
                                yield _sse_comment("heartbeat")
                        else:
                            final_state = chunk
                except RateLimitError as exc:
                    # 03_API_spec.md #29 "에러 시" / 05_RAG_design.md §10 — 스트림이 이미
                    # 200으로 시작해서 HTTP 상태코드를 더 못 바꾸므로 event: error로만 알린다.
                    # 사용자 메시지는 이미 커밋됐으니 그대로 두고(재시도 시 새 어시스턴트
                    # 메시지만 추가됨), 그래프 실패로 죽은 세션이 계속 열려 있지 않도록 여기서
                    # 스트림을 끝낸다. generate까지 성공해 답변이 이미 스트리밍됐다면 그 답변은
                    # 최선을 다해 저장한다(HIGH #2/MEDIUM #11 — _finish_after_upstream_failure
                    # 참고). 2026-08-26 레드팀 감사 4라운드 항목 10 — 이 지점이 RAG 그래프
                    # (retrieve/generate/verify) 전체 예외의 유일한 포집 지점인데 클라이언트
                    # SSE 응답만 만들고 서버엔 무로깅이었다.
                    logger.warning("Chat RAG graph rate-limited for session_id=%s", chat_session.id)
                    async for evt in _finish_after_upstream_failure(
                        session,
                        chat_session,
                        final_state,
                        trace,
                        span_metadata,
                        start,
                        "RATE_LIMITED",
                        str(exc),
                    ):
                        yield evt
                    return
                except Exception as exc:
                    logger.exception("Chat RAG graph failed for session_id=%s", chat_session.id)
                    async for evt in _finish_after_upstream_failure(
                        session,
                        chat_session,
                        final_state,
                        trace,
                        span_metadata,
                        start,
                        "UPSTREAM_LLM_ERROR",
                        str(exc),
                    ):
                        yield evt
                    return
            trace.update(
                output=final_state["answer"],
                metadata={
                    **span_metadata,
                    "verdict": final_state["verdict"],
                    "retry_count": final_state["retry_count"],
                    "retried": final_state["retry_count"] > 0,
                    "out_of_scope": out_of_scope,
                },
            )

        # 루프가 끝난 시점엔 final_state에 검색 근거(context)·최종 답변·검증 결과가 전부 들어있다.
        # 2026-08-26 레드팀 감사 4라운드 항목 8 — 3라운드에서 찾은 verify verdict 크래시
        # 지점(app/rag/generation.py가 이미 정상화하지만, Langfuse trace는 항목 11처럼 자체
        # 실패할 수 있어 독립적인 stdout 기록도 남긴다)이 무로깅이었다.
        logger.info(
            "Chat response verdict=%s retry_count=%s session_id=%s",
            final_state["verdict"],
            final_state["retry_count"],
            chat_session.id,
        )
        citations = _build_citations(final_state["context"])
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
            trace_ref=trace.trace_id,
        )
        session.add(assistant_message)
        await session.commit()
        await session.refresh(assistant_message)

        yield _sse(
            "done", DoneEventData(message_id=str(assistant_message.id), latency_ms=latency_ms)
        )
