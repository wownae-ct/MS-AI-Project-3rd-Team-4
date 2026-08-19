# backend

FastAPI(asyncio) 게이트웨이 + 에이전트 서비스. SQLAlchemy(async) ORM 사용, 마이그레이션 파일 없음(`db/` 참고).

```
app/
  gateway/
    main.py    FastAPI app 인스턴스 (Dockerfile CMD가 가리키는 지점)
    routers/   health/sessions/movements/profile/admin/ws — 도메인별 REST/WS 라우터
  agents/
    coach/     T2 — TCN 판정 + 코칭 LLM 스트리밍
    safety/    T3 — RAG + guardrail 안전 판정 (LangGraph 채택 여부 미정, 이 안에 캡슐화)
    planner/   T4 — 비동기 세션 리포트/처방 워커
    retriever/ 런타임 RAG 검색 (pgvector 조회만, 인덱싱은 안 함)
  inference/   ONNX Runtime TCN 추론 — models/*.onnx 로드해서 서빙 (ml 레포가 학습·export)
  stt/ tts/    음성 입출력
  db/
    models/    SQLAlchemy ORM 모델
  core/        설정, 공용 스키마
rag/
  index/       오프라인 인덱싱 — data/rag_corpus(정제 완료 문서)를 청킹·임베딩·pgvector upsert (수동/배치, 요청 경로 아님)
               원본 문서 정제 자체는 여기 아니라 data/ingest/<source>/ 담당
models/        ONNX 모델 아티팩트 (git 추적 안 함 — ml 레포에서 받아옴)
tests/
```

소유 브랜치: `backend`
