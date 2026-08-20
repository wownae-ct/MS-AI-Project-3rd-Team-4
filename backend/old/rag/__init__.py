"""RAG 오프라인 파이프라인. 요청 처리 경로에는 들어가지 않는다 — 수동/배치로 실행.
2단계로 나뉜다:
  1) data/ingest/<source>/  원본 문서 정제·가공 (raw -> data/rag_corpus)
  2) backend/rag/index/     정제된 문서 인덱싱 (data/rag_corpus -> pgvector)
런타임 검색(질의 시 벡터 검색)은 app/agents/retriever/가 담당 — 여기와 역할이 다르다."""
