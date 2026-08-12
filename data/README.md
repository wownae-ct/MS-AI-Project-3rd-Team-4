# data

RAG(retriever)가 참조하는 데이터. **ml 레포의 학습용 데이터셋(포즈/영상)과는 별개**다 — 이쪽은 텍스트 문서(운동 가이드, 부상/안전 가이드라인) 중심.

```
ingest/       원본 -> 정제 (소스별 raw_data/ + work/ + 정제 코드). 자세한 건 ingest/README.md
rag_corpus/   정제 완료된 최종 RAG 소스 문서 (텍스트/마크다운) — 추적함
```

정제된 문서(`rag_corpus/`)를 pgvector에 청킹·임베딩·upsert하는 코드는 `backend/rag/index/`에 있다.

전체 파이프라인: `ingest/<source>/raw_data` → (정제) → `rag_corpus/` → (`backend/rag/index/`) → pgvector → (`backend/app/agents/retriever/`가 런타임에 조회)
