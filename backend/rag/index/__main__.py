"""`python -m rag.index` 엔트리포인트 — rag-reindex CronJob이 이걸 실행한다.
data/rag_corpus/ 문서를 청킹·임베딩(Azure OpenAI)·pgvector upsert."""

import asyncio
from pathlib import Path

from app.core.config import get_settings
from app.core.embeddings import embed_texts, get_embedding_client
from app.db import get_connection
from app.db.queries.speech_guide import sync_docs_and_chunks
from rag.index.assemble import build_insertable_docs
from rag.index.chunker import chunk_text
from rag.index.corpus import load_corpus


async def main() -> None:
    settings = get_settings()
    docs = load_corpus(Path(settings.rag_corpus_path))
    chunked = [
        (d, chunk_text(d.body_text, settings.rag_chunk_min_chars, settings.rag_chunk_max_chars))
        for d in docs
    ]

    client = get_embedding_client(settings)
    all_texts = [c for _, chunks in chunked for c in chunks]
    embeddings = await embed_texts(client, all_texts, settings.azure_openai_embedding_deployment)
    insertable_docs = build_insertable_docs(chunked, embeddings)

    conn = await get_connection(settings)
    try:
        result = await sync_docs_and_chunks(conn, insertable_docs)
    finally:
        await conn.close()

    print(f"indexed {result.doc_count} docs, {result.chunk_count} chunks")


if __name__ == "__main__":
    asyncio.run(main())
