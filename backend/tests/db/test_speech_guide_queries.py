from contextlib import asynccontextmanager

import pytest

from app.db.queries.speech_guide import search_chunks_by_embedding, sync_docs_and_chunks
from rag.index.assemble import InsertableChunk, InsertableDoc


class FakeConnection:
    """asyncpg.Connection을 흉내내는 fake — 실제 DB 없이 호출 시퀀스와 SQL/파라미터를 기록한다."""

    def __init__(self, fetchval_return=1):
        self.calls: list[tuple[str, str, tuple]] = []  # (kind, sql, params)
        self._fetchval_return = fetchval_return
        self._fetchval_counter = 0

    @asynccontextmanager
    async def transaction(self):
        yield

    async def execute(self, sql, *params):
        self.calls.append(("execute", sql, params))

    async def fetchval(self, sql, *params):
        self.calls.append(("fetchval", sql, params))
        self._fetchval_counter += 1
        return self._fetchval_counter  # doc_id로 쓰일 값 — 문서마다 다른 id 부여

    async def fetch(self, sql, *params):
        self.calls.append(("fetch", sql, params))
        return []

    def execute_kinds(self):
        return [(kind, sql) for kind, sql, _ in self.calls]


def _doc(doc_number: int, n_chunks: int) -> InsertableDoc:
    chunks = [InsertableChunk(i, f"chunk-{doc_number}-{i}", [0.1, 0.2], 3) for i in range(n_chunks)]
    return InsertableDoc(
        doc_number=doc_number,
        title=f"제목{doc_number}",
        source_url=None,
        source_note=None,
        body_text="본문",
        category="카테고리",
        chunks=chunks,
    )


@pytest.mark.asyncio
async def test_sync_docs_and_chunks_upserts_doc_and_chunks():
    conn = FakeConnection()
    docs = [_doc(1, 2)]

    result = await sync_docs_and_chunks(conn, docs)

    assert result.doc_count == 1
    assert result.chunk_count == 2

    doc_insert_calls = [c for c in conn.calls if c[0] == "fetchval"]
    assert len(doc_insert_calls) == 1
    assert "ON CONFLICT (doc_number)" in doc_insert_calls[0][1]

    chunk_insert_calls = [
        c for c in conn.calls if c[0] == "execute" and "INSERT INTO speech_guide_chunk" in c[1]
    ]
    assert len(chunk_insert_calls) == 2
    assert all("ON CONFLICT (doc_id, chunk_index)" in c[1] for c in chunk_insert_calls)


@pytest.mark.asyncio
async def test_sync_docs_and_chunks_deletes_orphan_chunks_before_orphan_docs():
    conn = FakeConnection()
    docs = [_doc(1, 1)]  # doc_number=2였던 문서는 이번 코퍼스에서 빠졌다고 가정

    await sync_docs_and_chunks(conn, docs)

    chunk_delete_idx = next(
        i
        for i, (kind, sql, _) in enumerate(conn.calls)
        if kind == "execute" and "DELETE FROM speech_guide_chunk WHERE doc_id IN" in sql
    )
    doc_delete_idx = next(
        i
        for i, (kind, sql, _) in enumerate(conn.calls)
        if kind == "execute" and "DELETE FROM speech_guide_doc WHERE doc_number" in sql
    )

    # FK 위반(ON DELETE CASCADE 없음)을 피하려면 자식(청크) 삭제가 부모(doc) 삭제보다 먼저 나와야 함
    assert chunk_delete_idx < doc_delete_idx


@pytest.mark.asyncio
async def test_sync_docs_and_chunks_is_idempotent_same_call_sequence():
    docs = [_doc(1, 2), _doc(2, 1)]

    conn1 = FakeConnection()
    await sync_docs_and_chunks(conn1, docs)
    sequence1 = conn1.execute_kinds()

    conn2 = FakeConnection()
    await sync_docs_and_chunks(conn2, docs)
    sequence2 = conn2.execute_kinds()

    assert sequence1 == sequence2


@pytest.mark.asyncio
async def test_search_chunks_by_embedding_passes_k_through():
    conn = FakeConnection()

    await search_chunks_by_embedding(conn, [0.1, 0.2], k=7)

    fetch_calls = [c for c in conn.calls if c[0] == "fetch"]
    assert len(fetch_calls) == 1
    _, sql, params = fetch_calls[0]
    assert "speech_guide_chunk" in sql
    assert params[-1] == 7
