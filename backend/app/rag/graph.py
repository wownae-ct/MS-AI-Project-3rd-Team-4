"""LangGraph 3노드: retrieve → generate → verify. 재시도/재검색 루프 없음(의도적 단순화,
05_RAG_design.md §5). 프롬프트/근거검증 로직은 app.rag.generation 공유 모듈을 쓴다.

검색 결과가 0건이면(RAG_NO_CONTEXT, API 명세서 #22) LLM을 아예 호출하지 않고 고정 안내 문구 +
verdict=GENERAL로 처리한다 — 근거 없는 질문에 모델이 그럴듯한 답을 지어내는 걸 원천 차단한다.

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
신호로, app/services/chat.py가 SSE stage 이벤트로 그대로 전달한다."""

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
    verify_answer,
)
from app.rag.retrieval import RetrievedChunk, retrieve


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


# ① retrieve: 질문+카테고리로 하이브리드 검색(retrieval.py)을 돌려 근거 청크를 찾아온다.
async def retrieve_node(state: ChatState, config: RunnableConfig) -> dict:
    # 노드 진입 직후 곧바로 "지금 이 단계다"를 흘려보낸다 — generate_node가 이미 쓰는
    # get_stream_writer() 패턴 그대로, 노드가 실제로 뭘 하기 전에 먼저 알린다.
    get_stream_writer()({"type": "stage", "stage": "retrieve"})
    session = config["configurable"]["session"]
    settings: Settings = config["configurable"].get("settings") or get_settings()
    async with traced_span("chat.retrieve", settings=settings, input=state["query"]):
        chunks = await retrieve(session, state["query"], state["category_code"], settings)
        return {"context": chunks}


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
            model=settings.azure_openai_chat_deployment,
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
    get_stream_writer()({"type": "stage", "stage": "verify"})
    settings: Settings = config["configurable"].get("settings") or get_settings()
    async with traced_span("chat.verify", settings=settings, input=state["answer"]):
        if not state["context"]:
            return {"verdict": "GENERAL", "verification_reason": NO_CONTEXT_REASON}

        client = get_azure_openai_client(settings)
        verdict, reason = await verify_answer(client, settings, state["context"], state["answer"])
        return {"verdict": verdict, "verification_reason": reason}


# 위 3개 노드를 retrieve → generate → verify 순서로 한 번씩만 실행하도록 연결한 뒤 컴파일한다
# (되묻거나 재검색하는 사이클 없음, 05_RAG_design.md §5의 의도적 단순화 결정).
def build_graph() -> CompiledStateGraph:
    graph = StateGraph(ChatState)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("generate", generate_node)
    graph.add_node("verify", verify_node)
    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "generate")
    graph.add_edge("generate", "verify")
    graph.add_edge("verify", END)
    return graph.compile()
