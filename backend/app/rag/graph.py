"""LangGraph 3노드: retrieve → generate → verify. 노드 3개 상한은 유지하되, verify가
WEAK/GENERAL 판정을 내면 verify→retrieve 조건부 엣지로 최대 1회 한정 되돌아간다(CRAG,
Corrective RAG 패턴 — 05_RAG_design.md §5, 2026-08-24 결정). 같은 쿼리로 그냥 재시도하는
"약한" 버전이 아니라, verify가 남긴 판정 사유를 근거로 LLM이 검색 질의를 재구성한 뒤 그 새
질의로 다시 검색하는 "강한" 버전이다(generation.reformulate_query). 프롬프트/근거검증/질의
재구성 로직은 app.rag.generation 공유 모듈을 쓴다.

검색 결과가 0건이면(RAG_NO_CONTEXT, API 명세서 #22) LLM을 아예 호출하지 않고 고정 안내 문구 +
verdict=GENERAL로 처리한다 — 근거 없는 질문에 모델이 그럴듯한 답을 지어내는 걸 원천 차단한다.
이 경로도 재검색 대상이다: 0건 검색 → GENERAL → 재구성된 질의로 1회 재검색을 시도한다.

generate_node는 LangGraph 네이티브 커스텀 스트리밍(get_stream_writer + stream_mode="custom")으로
토큰을 실시간으로 흘려보낸다 — LangChain 러너블이 아니라 openai SDK를 직접 쓰므로 astream_events는
못 쓰지만, get_stream_writer()는 러너블 없이도 노드 안에서 임의 데이터를 실시간 스트림에 얹을 수
있는 공식 API다. stream_mode="custom" 없이 ainvoke()/astream(stream_mode="values")로 호출하면
writer가 기본 no-op이라(langgraph.runtime.Runtime.stream_writer 기본값) 평가 스크립트 같은 배치
용도에도 그대로 쓸 수 있다 — app/services/chat.py의 실시간 SSE 스트리밍과 이 그래프가 같은 코드
경로를 공유한다(과거엔 두 곳에 로직이 중복돼 있었음).

세 노드 모두 진입 직후 {"type": "stage", "stage": "retrieve"/"generate"/"verify"}를 먼저
흘려보낸다 — 토큰과 같은 writer() 채널(stream_mode="custom")을 타므로 그래프 토폴로지나
State 스키마는 그대로다. 최종 결과(answer/context/verdict)엔 전혀 영향 없는 순수 UX용
신호로, app/services/chat.py가 SSE stage 이벤트로 그대로 전달한다. retrieve_node는 재시도
호출이면 이 stage 이벤트보다 먼저 {"type": "retry", "reason": ...}를 한 번 더 흘려보낸다.

retrieve_node가 재시도 여부를 판단할 때 state["verdict"]가 아니라 state.get("verdict")를 쓴다
— run_rag_eval.py가 verdict/retry_count 키 없이 불완전한 초기 state로 graph.ainvoke()를
호출하는데, LangGraph는 한 번도 안 쓰인 채널 키를 아예 안 넘겨줘서(read_channels(skip_empty=True))
[...]였으면 그 스크립트가 깨진다. ChatState의 6개 필드 전부 Annotated 리듀서 없이 순수 타입
힌트만 쓰므로(operator.add 같은 누적 채널 아님) 전부 덮어쓰기 채널이다 — 2차 retrieve_node가
반환하는 context가 1차 결과를 완전히 교체하고, 1차의 "근거 부족" 컨텍스트가 2차 답변에 섞여
들어갈 위험이 없다."""

import asyncio
from collections.abc import Awaitable, Callable
from typing import TypedDict

from langchain_core.runnables import RunnableConfig
from langgraph.config import get_stream_writer
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.core.config import Settings, get_settings
from app.core.embeddings import get_azure_openai_client
from app.core.tracing import traced_span
from app.rag.generation import (
    NO_CONTEXT_ANSWER,
    NO_CONTEXT_REASON,
    build_chat_messages,
    reformulate_query,
    verify_answer,
)
from app.rag.query_profile import profile_query
from app.rag.retrieval import RetrievedChunk, retrieve

# CRAG 재검색 루프의 상한. 무한루프/비용 폭증 방지가 목적이라 설정값으로 노출하지 않고 코드에
# 고정한다(2026-08-24 결정 — "최대 재시도 1회로 상한").
_MAX_RETRIES = 1

# 2026-08-26 챗 SSE 타임아웃 회귀 수정 — verify_answer/reformulate_query는 generate_node와
# 달리 스트리밍 없는 단발 호출이라, 대기 중엔 SSE로 바이트가 하나도 안 나간다. 이 침묵 구간이
# nginx ingress의 proxy-read-timeout(기본 60초, app/core/config.py::azure_openai_timeout_seconds
# 주석 참고)에 걸리면 클라이언트 쪽엔 "타임아웃 에러"로 보인다 — settings.azure_openai_
# timeout_seconds(기본 45초)가 그 호출 자체를 하드 타임아웃시켜주지만, 그 45초 동안에도 아무
# 바이트가 안 나가면 프록시 기본값(60초)보다는 짧아도 위험할 수 있어 별도로 흘려보낸다. SSE
# 주석 줄(app/services/chat.py::_sse_comment)은 스펙상 이벤트가 아니라 기존 파서가 그대로
# 무시하므로 프론트 변경이 전혀 필요 없다.
_HEARTBEAT_INTERVAL_SECONDS = 15.0


async def _await_with_heartbeat[T](awaitable: Awaitable[T], writer: Callable[[dict], None]) -> T:
    """awaitable이 끝날 때까지 _HEARTBEAT_INTERVAL_SECONDS마다 heartbeat 커스텀 이벤트를
    흘려보낸다. asyncio.wait는 완료된 태스크를 취소하지 않으므로, 이미 끝난 뒤에도 다시 부르면
    즉시 반환한다 — 반복문이 매번 새 wait를 걸어도 안전하다."""
    task: asyncio.Task[T] = asyncio.ensure_future(awaitable)
    while True:
        done, _pending = await asyncio.wait({task}, timeout=_HEARTBEAT_INTERVAL_SECONDS)
        if task in done:
            return task.result()
        writer({"type": "heartbeat"})


# 그래프가 흘러가면서 채워지는 "상태 보따리". 노드 하나가 끝날 때마다 여기 필드가 하나씩 채워져서
# 다음 노드로 넘어간다 — retrieve_node가 context를 채우면 generate_node가 그걸 읽어서 answer를
# 채우고, verify_node가 answer를 읽어서 verdict/verification_reason을 채우는 식.
class ChatState(TypedDict):
    query: str  # 사용자 질문 원문
    # 어느 카테고리(VENUE/SDM 등) 질문인지 — 검색 필터·프롬프트에 씀. None이면 카테고리 무관
    # 전역 상담(12_final_prototype_mockup.html 하단 탭바의 "AI상담") — retrieve/generation이
    # 각각 카테고리 필터 생략/프롬프트 문구 생략으로 처리한다.
    category_code: str | None
    context: list[RetrievedChunk]  # retrieve_node가 찾아온 근거 청크 목록
    answer: str  # generate_node가 만든 답변
    verdict: str  # verify_node의 판정: SUPPORTED/WEAK/GENERAL
    verification_reason: str  # 그 판정을 내린 이유 한 줄
    retry_count: int  # verify가 WEAK/GENERAL이라 retrieve로 되돌아간 횟수. 최대 _MAX_RETRIES(1).


# ① retrieve: 질문+카테고리로 하이브리드 검색(retrieval.py)을 돌려 근거 청크를 찾아온다.
# state["verdict"]가 WEAK/GENERAL이면 이전 시도가 재시도로 돌아온 것 — 원본 질문(state["query"])은
# 그대로 두고, 그 판정 사유를 근거로 LLM이 재구성한 검색어로만 다시 검색한다(CRAG).
async def retrieve_node(state: ChatState, config: RunnableConfig) -> dict:
    is_retry = state.get("verdict") in ("WEAK", "GENERAL")
    writer = get_stream_writer()
    if is_retry:
        # 프론트에 "1차 답변은 버리고 새로 시작한다"를 알리는 신호 — stage/token 이벤트와
        # 같은 커스텀 스트림 채널을 탄다(app/services/chat.py가 event: retry로 전달). stage
        # 이벤트보다 먼저 보내서, 프론트가 이 스트림이 재시도라는 걸 곧바로 알 수 있게 한다.
        writer({"type": "retry", "reason": state["verification_reason"]})
    # 노드 진입 직후 곧바로 "지금 이 단계다"를 흘려보낸다 — generate_node가 이미 쓰는
    # get_stream_writer() 패턴 그대로, 노드가 실제로 뭘 하기 전에 먼저 알린다.
    writer({"type": "stage", "stage": "retrieve"})
    session = config["configurable"]["session"]
    settings: Settings = config["configurable"].get("settings") or get_settings()
    search_query = state["query"]
    # 재시도 시엔 span 이름 자체를 다르게 지어(chat.retrieve_retry) Langfuse에서 재시도를 셀 수
    # 있게 한다 — 대시보드 위젯 API는 커스텀 metadata를 집계 차원으로 못 쓰고 name 같은 OTel
    # 표준 필드만 지원한다(2026-08-24-langfuse-tracing-completion.md에서 실제 400 에러로 확인된
    # 제약). trace.update(metadata={"retry_count": ...})는 트레이스 목록 수동 필터링용으로 별도
    # 유지한다(app/services/chat.py). metadata(category_code/질의 품질 태깅) 자체는 observation
    # 메타데이터라 위젯 차원 제약과 무관하게 그대로 유지한다(app/rag/query_profile.py).
    span_name = "chat.retrieve_retry" if is_retry else "chat.retrieve"
    async with traced_span(
        span_name,
        settings=settings,
        input=state["query"],
        metadata={
            "category_code": state["category_code"] or "ALL",
            **profile_query(state["query"]).as_metadata(),
        },
    ) as trace:
        if is_retry:
            client = get_azure_openai_client(settings)
            search_query = await _await_with_heartbeat(
                reformulate_query(client, settings, state["query"], state["verification_reason"]),
                writer,
            )
        chunks = await retrieve(session, search_query, state["category_code"], settings)
        # Phase 7 감사(Low) — 검색은 OpenAI 호출이 아니라 순수 DB 쿼리라 langfuse.openai
        # monkeypatch의 자동계측 대상이 아니다(generate/verify 노드와 달리 이 노드만 자기 span에
        # output을 직접 안 채우면 Langfuse UI에 "뭐가 검색됐는지"가 전혀 안 남는다). chunk_id만
        # 남기고 본문(content)은 싣지 않는다 — 디버깅엔 ID로 DB를 다시 찾아보면 충분하고, 본문까지
        # 실으면 payload만 커진다. 0건이어도(RAG_NO_CONTEXT) 빈 리스트를 명시적으로 남겨 "0건
        # 검색됨"과 "기록 안 됨"을 구분한다.
        trace.update(output=[c.chunk_id for c in chunks])
        update: dict = {"context": chunks}
        if is_retry:
            update["retry_count"] = state.get("retry_count", 0) + 1
        return update


# ② generate: 찾아온 근거만 보고 AI가 답변을 쓴다. 이 함수가 핵심 — 답변을 다 만든 뒤 한 번에
#    반환하는 게 아니라, OpenAI가 글자를 만들어내는 족족(delta) writer()로 흘려보내서 사용자
#    화면에 실시간 타이핑처럼 보이게 한다(진짜 실시간 스트리밍, 사후에 잘라 보내는 게 아님).
async def generate_node(state: ChatState, config: RunnableConfig) -> dict:
    # 스트리밍 중이 아니면(배치 실행 등) writer는 그냥 아무 일도 안 하는 함수가 된다.
    writer = get_stream_writer()
    writer({"type": "stage", "stage": "generate"})
    settings: Settings = config["configurable"].get("settings") or get_settings()

    async with traced_span("chat.generate", settings=settings, input=state["query"]):
        if not state["context"]:
            # 근거 자료가 0건이면 AI를 아예 호출하지 않는다 — 근거 없이 그럴듯한 답을 지어내는 걸
            # (환각) 원천 차단하기 위한 의도적인 설계.
            writer({"type": "token", "delta": NO_CONTEXT_ANSWER})
            return {"answer": NO_CONTEXT_ANSWER}

        client = get_azure_openai_client(settings)
        stream = await client.chat.completions.create(
            model=settings.chat_rag_deployment,
            messages=build_chat_messages(state["category_code"], state["context"], state["query"]),
            stream=True,  # 완성된 답변을 한 번에 안 받고, 글자 조각(delta) 단위로 하나씩 받는다
        )
        answer_parts: list[str] = []
        async for event in stream:
            delta = event.choices[0].delta.content if event.choices else None
            if delta:
                answer_parts.append(delta)  # 나중에 전체 답변을 조립하기 위해 계속 이어붙임
                writer(
                    {"type": "token", "delta": delta}
                )  # 동시에 실시간으로 클라이언트에도 흘려보냄
        return {"answer": "".join(answer_parts)}


# ③ verify: 방금 쓴 답변이 근거 자료로 실제 뒷받침되는지 AI에게 한 번 더 물어본다("셀프 채점").
#    근거가 없으면(0건 검색) 굳이 다시 물어볼 것도 없이 곧바로 GENERAL로 확정.
async def verify_node(state: ChatState, config: RunnableConfig) -> dict:
    writer = get_stream_writer()
    writer({"type": "stage", "stage": "verify"})
    settings: Settings = config["configurable"].get("settings") or get_settings()
    async with traced_span("chat.verify", settings=settings, input=state["answer"]):
        if not state["context"]:
            return {"verdict": "GENERAL", "verification_reason": NO_CONTEXT_REASON}

        client = get_azure_openai_client(settings)
        verdict, reason = await _await_with_heartbeat(
            verify_answer(client, settings, state["context"], state["answer"]), writer
        )
        return {"verdict": verdict, "verification_reason": reason}


# verify 직후 호출되는 라우팅 함수. WEAK/GENERAL인데 아직 재시도를 안 썼으면(retry_count가
# 상한 미만) retrieve로 되돌아가고, 아니면(SUPPORTED거나 이미 1회 재시도했으면) 끝낸다.
# retrieve_node가 재시도 시에만 retry_count를 올리므로, 2차 verify 이후엔 결과가 뭐든
# retry_count(1) < _MAX_RETRIES(1)가 거짓이 되어 무조건 END — 정확히 최대 1회로 종료가 보장된다.
def _route_after_verify(state: ChatState) -> str:
    if state["verdict"] in ("WEAK", "GENERAL") and state.get("retry_count", 0) < _MAX_RETRIES:
        return "retrieve"
    return END


# 위 3개 노드를 retrieve → generate → verify 순서로 연결하되, verify → retrieve는 조건부
# 엣지다(CRAG 재검색 루프, 최대 1회). 노드 자체는 여전히 3개 상한 — 새 노드를 추가한 게 아니라
# verify의 나가는 엣지 하나만 조건부로 바꿨다.
def build_graph() -> CompiledStateGraph:
    graph = StateGraph(ChatState)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("generate", generate_node)
    graph.add_node("verify", verify_node)
    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "generate")
    graph.add_edge("generate", "verify")
    graph.add_conditional_edges("verify", _route_after_verify, {"retrieve": "retrieve", END: END})
    return graph.compile()
