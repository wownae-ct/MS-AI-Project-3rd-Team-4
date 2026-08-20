"""하이브리드 검색: 카테고리 하드필터 → (벡터 top-k + tsvector top-k) → RRF 융합 → top-k 컨텍스트.

backend/old/app/agents/retriever/search.py(단일 pgvector top-k)를 대체 — 검색 대상 테이블
(rag_chunks)과 융합 로직(RRF) 자체가 다르므로 이식이 아니라 새로 작성한다(05_RAG_design.md §4,
계약조건(item_type='CONTRACT_TERM') 키워드 가중치는 §4 F9 참조)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: int
    content: str
    source_tier: str
    source_url: str | None


async def retrieve(query: str, category_code: str) -> list[RetrievedChunk]:
    raise NotImplementedError
