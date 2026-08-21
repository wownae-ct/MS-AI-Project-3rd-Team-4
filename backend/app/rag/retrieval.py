"""하이브리드 검색: 카테고리 하드필터 → (벡터 top-8 + tsvector top-4) → RRF 융합 → top-5 컨텍스트.

backend/old/app/agents/retriever/search.py(단일 pgvector top-k)를 대체 — 검색 대상 테이블
(rag_chunks)과 융합 로직(RRF) 자체가 다르므로 이식이 아니라 새로 작성한다(05_RAG_design.md §4,
계약조건(item_type='CONTRACT_TERM') 키워드 가중치는 같은 절 F9 참조).

카테고리 필터는 `category_codes @> ARRAY[:category_code]`(배열 포함 검색) — rag_chunks.category_codes
가 TEXT[]인 이유는 04_DB_spec.md (12) 참고."""

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.embeddings import embed_query, get_azure_openai_client, to_pgvector_literal

# F9: 질문이 이 키워드를 포함하면 계약조건(item_type='CONTRACT_TERM') 청크에 RRF 점수를 가산한다.
_CONTRACT_TERM_KEYWORDS = ("계약", "위약금", "해지")
_CONTRACT_TERM_BONUS = 0.1


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: int
    content: str
    title: str
    source_tier: str
    source_url: str | None


_SEARCH_SQL = text("""
    WITH vector_search AS (
        SELECT id, content, document_id, item_type, source_url,
               ROW_NUMBER() OVER (ORDER BY embedding <=> CAST(:query_embedding AS vector)) AS rank
        FROM rag_chunks
        WHERE category_codes @> ARRAY[:category_code]
        ORDER BY embedding <=> CAST(:query_embedding AS vector)
        LIMIT :vector_top_k
    ),
    keyword_search AS (
        SELECT id, content, document_id, item_type, source_url,
               ROW_NUMBER() OVER (
                   ORDER BY ts_rank(tsv, plainto_tsquery('simple', :query_text)) DESC
               ) AS rank
        FROM rag_chunks
        WHERE category_codes @> ARRAY[:category_code]
          AND tsv @@ plainto_tsquery('simple', :query_text)
        LIMIT :tsvector_top_k
    ),
    merged AS (
        SELECT
            COALESCE(v.id, k.id) AS id,
            COALESCE(v.content, k.content) AS content,
            COALESCE(v.document_id, k.document_id) AS document_id,
            COALESCE(v.source_url, k.source_url) AS source_url,
            (1.0 / (:rrf_k + COALESCE(v.rank, 1000)))
                + (1.0 / (:rrf_k + COALESCE(k.rank, 1000)))
                + CASE
                      WHEN :apply_contract_bonus
                           AND COALESCE(v.item_type, k.item_type) = 'CONTRACT_TERM'
                      THEN :contract_bonus
                      ELSE 0
                  END AS rrf_score
        FROM vector_search v
        FULL OUTER JOIN keyword_search k ON v.id = k.id
    )
    SELECT
        m.id AS chunk_id,
        m.content,
        d.title,
        d.source_tier,
        COALESCE(m.source_url, d.source_url) AS source_url
    FROM merged m
    JOIN rag_documents d ON d.id = m.document_id
    ORDER BY m.rrf_score DESC
    LIMIT :context_top_k
""")


def _needs_contract_term_bonus(query: str) -> bool:
    return any(keyword in query for keyword in _CONTRACT_TERM_KEYWORDS)


async def retrieve(
    session: AsyncSession,
    query: str,
    category_code: str,
    settings: Settings | None = None,
) -> list[RetrievedChunk]:
    settings = settings or get_settings()
    client = get_azure_openai_client(settings)
    query_embedding = await embed_query(client, query, settings.azure_openai_embedding_deployment)

    result = await session.execute(
        _SEARCH_SQL,
        {
            "query_embedding": to_pgvector_literal(query_embedding),
            "category_code": category_code,
            "query_text": query,
            "vector_top_k": settings.rag_vector_top_k,
            "tsvector_top_k": settings.rag_tsvector_top_k,
            "rrf_k": settings.rag_rrf_k,
            "context_top_k": settings.rag_context_top_k,
            "apply_contract_bonus": _needs_contract_term_bonus(query),
            "contract_bonus": _CONTRACT_TERM_BONUS,
        },
    )
    return [
        RetrievedChunk(
            chunk_id=row.chunk_id,
            content=row.content,
            title=row.title,
            source_tier=row.source_tier,
            source_url=row.source_url,
        )
        for row in result
    ]
