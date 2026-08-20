"""speech_guide_doc/speech_guide_chunk 쿼리 함수. doc_number/(doc_id, chunk_index)가
자연키(db/migrations/0002_speech_guide_doc_metadata.sql)라 TRUNCATE 대신 ON CONFLICT upsert —
안 바뀐 청크는 재색인해도 id가 그대로 유지된다(guardrail_check.citation_chunk_ids가 가리키는
대상이 안정적으로 유지되는 게 중요).

FK 주의: speech_guide_chunk.doc_id는 ON DELETE CASCADE 없이 REFERENCES speech_guide_doc (id)뿐
(db/migrations/0001_init.sql) — 코퍼스에서 빠진 doc를 지울 때 자식 청크가 남아있으면 FK 위반으로
트랜잭션 전체가 롤백된다. 그래서 자식부터 명시적으로 지운다."""

from dataclasses import dataclass

import asyncpg
from rag.index.assemble import InsertableDoc

from app.core.embeddings import to_pgvector_literal


@dataclass(frozen=True)
class SyncResult:
    doc_count: int
    chunk_count: int


async def sync_docs_and_chunks(conn: asyncpg.Connection, docs: list[InsertableDoc]) -> SyncResult:
    async with conn.transaction():
        for doc in docs:
            doc_id = await conn.fetchval(
                "INSERT INTO speech_guide_doc (doc_number, title, source_url, source_note, body_text, category) "
                "VALUES ($1,$2,$3,$4,$5,$6) "
                "ON CONFLICT (doc_number) DO UPDATE SET "
                "  title=EXCLUDED.title, source_url=EXCLUDED.source_url, source_note=EXCLUDED.source_note, "
                "  body_text=EXCLUDED.body_text, category=EXCLUDED.category "
                "RETURNING id",
                doc.doc_number,
                doc.title,
                doc.source_url,
                doc.source_note,
                doc.body_text,
                doc.category,
            )

            for chunk in doc.chunks:
                await conn.execute(
                    "INSERT INTO speech_guide_chunk (doc_id, chunk_index, chunk_text, embedding, token_count) "
                    "VALUES ($1,$2,$3,$4::vector,$5) "
                    "ON CONFLICT (doc_id, chunk_index) DO UPDATE SET "
                    "  chunk_text=EXCLUDED.chunk_text, embedding=EXCLUDED.embedding, token_count=EXCLUDED.token_count",
                    doc_id,
                    chunk.chunk_index,
                    chunk.chunk_text,
                    to_pgvector_literal(chunk.embedding),
                    chunk.token_count,
                )
            # 청크 수가 줄어든 doc의 남는 청크 정리(같은 doc 안이라 FK 문제 없음 — 부모는 안 지움).
            await conn.execute(
                "DELETE FROM speech_guide_chunk WHERE doc_id=$1 AND chunk_index >= $2",
                doc_id,
                len(doc.chunks),
            )

        # 코퍼스에서 아예 빠진 doc 정리 — 자식 청크 먼저, FK 위반 방지.
        doc_numbers = [d.doc_number for d in docs]
        await conn.execute(
            "DELETE FROM speech_guide_chunk WHERE doc_id IN ("
            "  SELECT id FROM speech_guide_doc "
            "  WHERE doc_number IS NOT NULL AND NOT (doc_number = ANY($1::int[])))",
            doc_numbers,
        )
        await conn.execute(
            "DELETE FROM speech_guide_doc WHERE doc_number IS NOT NULL AND NOT (doc_number = ANY($1::int[]))",
            doc_numbers,
        )

    return SyncResult(doc_count=len(docs), chunk_count=sum(len(d.chunks) for d in docs))


async def search_chunks_by_embedding(
    conn: asyncpg.Connection, query_embedding: list[float], k: int
) -> list[asyncpg.Record]:
    return await conn.fetch(
        "SELECT c.id AS chunk_id, c.doc_id, c.chunk_text, c.chunk_index, "
        "       d.title, d.source_url, d.source_note, d.category, c.embedding <=> $1::vector AS distance "
        "FROM speech_guide_chunk c JOIN speech_guide_doc d ON d.id = c.doc_id "
        "ORDER BY c.embedding <=> $1::vector LIMIT $2",
        to_pgvector_literal(query_embedding),
        k,
    )
