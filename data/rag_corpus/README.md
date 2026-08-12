# rag_corpus

큐레이션된 RAG 소스 문서. `backend/rag/index/`가 이 폴더를 읽어 청킹→임베딩→pgvector에 upsert한다.
(원본 → 이 폴더로 정제하는 코드는 `data/ingest/<source>/`)

예정 소스: 운동 동작 가이드(크로스핏+일반 헬스), 부상 예방/안전 가이드라인(대한스포츠의학회 등).
문서 자체가 작은 텍스트/마크다운이라 git으로 추적한다(대용량 원본은 `../ingest/<source>/raw_data/`).
