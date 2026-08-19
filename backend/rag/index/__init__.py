"""정제된 코퍼스(data/rag_corpus) -> 청킹 -> 임베딩(Azure OpenAI) -> pgvector upsert.
원본 문서를 정제하는 단계(data/ingest/<source>/)와는 다른 단계 — 여긴 "이미 깨끗한 문서"를 받아 인덱싱만 한다."""
