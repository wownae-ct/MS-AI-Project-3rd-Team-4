"""coach·verify 공용 RAG 검색(런타임, 요청 경로). pgvector HNSW top-k 임베딩 검색 단일 경로.
FastAPI Depends 기반 커넥션 풀 주입은 아직 안 함 — 이 함수를 호출하는 라우트가 아직 없음
(coach/verify는 다음 세션 범위, YAGNI)."""

from dataclasses import dataclass

import asyncpg
from openai import AsyncAzureOpenAI

from app.core.config import get_settings
from app.core.embeddings import embed_query, get_embedding_client
from app.db import get_connection
from app.db.queries.speech_guide import search_chunks_by_embedding


@dataclass(frozen=True)
class SpeechGuideMatch:
    chunk_id: int
    doc_id: int
    chunk_index: int
    title: str
    category: str | None
    source_url: str | None
    source_note: str | None
    chunk_text: str
    distance: float


async def search_speech_guide(
    query: str,
    k: int | None = None,
    *,
    conn: asyncpg.Connection | None = None,
    client: AsyncAzureOpenAI | None = None,
) -> list[SpeechGuideMatch]:
    settings = get_settings()
    k = k or settings.rag_search_default_k

    client = client or get_embedding_client(settings)
    query_embedding = await embed_query(client, query, settings.azure_openai_embedding_deployment)

    owns_conn = conn is None
    conn = conn or await get_connection(settings)
    try:
        rows = await search_chunks_by_embedding(conn, query_embedding, k)
    finally:
        if owns_conn:
            await conn.close()

    return [SpeechGuideMatch(**dict(r)) for r in rows]
