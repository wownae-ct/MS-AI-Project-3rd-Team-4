"""LangGraph 3노드: retrieve → generate → verify. 재시도/재검색 루프 없음(의도적 단순화,
05_RAG_design.md §5). 프롬프트/근거검증 로직은 app.rag.generation 공유 모듈을 쓴다.

검색 결과가 0건이면(RAG_NO_CONTEXT, API 명세서 #22) LLM을 아예 호출하지 않고 고정 안내 문구 +
verdict=GENERAL로 처리한다 — 근거 없는 질문에 모델이 그럴듯한 답을 지어내는 걸 원천 차단한다.

이 그래프는 스트리밍하지 않는다(완성된 답변 하나를 한 번에 반환). 실제 SSE 토큰 스트리밍은
app/services/chat.py가 이 그래프를 거치지 않고 client.chat.completions.create(..., stream=True)를
직접 호출한다 — 이 프로젝트는 LangChain 러너블이 아니라 openai SDK를 직접 쓰므로, LangGraph의
`astream_events`가 채팅 모델 토큰을 자동으로 잡아주지 않는다(LangChain 콜백 체계에 연결된
러너블에서만 동작). 그래서 이 그래프는 스트리밍이 필요 없는 용도(평가 스크립트, 배치 테스트 등)에
쓴다."""

from typing import TypedDict

from langchain_core.runnables import RunnableConfig
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
    if not state["context"]:
        return {"answer": NO_CONTEXT_ANSWER}

    settings: Settings = config["configurable"].get("settings") or get_settings()
    client = get_azure_openai_client(settings)
    response = await client.chat.completions.create(
        model=settings.azure_openai_chat_deployment,
        messages=build_chat_messages(state["category_code"], state["context"], state["query"]),
    )
    return {"answer": response.choices[0].message.content}


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
