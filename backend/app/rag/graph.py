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
경로를 공유한다(과거엔 두 곳에 로직이 중복돼 있었음)."""

from typing import TypedDict

from langchain_core.runnables import RunnableConfig
from langgraph.config import get_stream_writer
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.core.config import Settings, get_settings
from app.core.embeddings import get_azure_openai_client
from app.rag.generation import (
    NO_CONTEXT_ANSWER,
    NO_CONTEXT_REASON,
    build_chat_messages,
    verify_answer,
)
from app.rag.retrieval import RetrievedChunk, retrieve


class ChatState(TypedDict):
    query: str
    category_code: str
    context: list[RetrievedChunk]
    answer: str
    verdict: str  # SUPPORTED/WEAK/GENERAL
    verification_reason: str


async def retrieve_node(state: ChatState, config: RunnableConfig) -> dict:
    session = config["configurable"]["session"]
    settings: Settings = config["configurable"].get("settings") or get_settings()
    chunks = await retrieve(session, state["query"], state["category_code"], settings)
    return {"context": chunks}


async def generate_node(state: ChatState, config: RunnableConfig) -> dict:
    writer = get_stream_writer()

    if not state["context"]:
        writer({"type": "token", "delta": NO_CONTEXT_ANSWER})
        return {"answer": NO_CONTEXT_ANSWER}

    settings: Settings = config["configurable"].get("settings") or get_settings()
    client = get_azure_openai_client(settings)
    stream = await client.chat.completions.create(
        model=settings.azure_openai_chat_deployment,
        messages=build_chat_messages(state["category_code"], state["context"], state["query"]),
        stream=True,
    )
    answer_parts: list[str] = []
    async for event in stream:
        delta = event.choices[0].delta.content if event.choices else None
        if delta:
            answer_parts.append(delta)
            writer({"type": "token", "delta": delta})
    return {"answer": "".join(answer_parts)}


async def verify_node(state: ChatState, config: RunnableConfig) -> dict:
    if not state["context"]:
        return {"verdict": "GENERAL", "verification_reason": NO_CONTEXT_REASON}

    settings: Settings = config["configurable"].get("settings") or get_settings()
    client = get_azure_openai_client(settings)
    verdict, reason = await verify_answer(client, settings, state["context"], state["answer"])
    return {"verdict": verdict, "verification_reason": reason}


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
