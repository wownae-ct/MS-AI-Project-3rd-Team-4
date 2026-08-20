"""LangGraph 3노드: retrieve → generate → verify. 재시도/재검색 루프 없음(의도적 단순화,
05_RAG_design.md §5). SSE 스트리밍은 generate 노드의 토큰 스트림을 그대로 라우터에서 흘려보낸다."""

from typing import TypedDict


class ChatState(TypedDict):
    query: str
    category_code: str
    context: list  # app.rag.retrieval.RetrievedChunk 목록
    answer: str
    verdict: str  # SUPPORTED/WEAK/GENERAL


def build_graph():
    raise NotImplementedError
