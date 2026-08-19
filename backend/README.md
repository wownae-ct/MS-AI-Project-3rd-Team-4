# backend

FastAPI(asyncio) 게이트웨이 + 에이전트 서비스. SQLAlchemy(async) ORM 사용, 마이그레이션 파일 없음(`db/` 참고).

```
app/
  gateway/
    main.py    FastAPI app 인스턴스 (Dockerfile CMD가 가리키는 지점)
    routers/   health/questions/sessions/answers/reports/admin — 도메인별 REST 라우터 (SSE만, WS 없음)
  agents/
    coach/     S3 — 두괄식/STAR 구조 판정 + 전달력 피드백 LLM 스트리밍
    verify/    S4 — RAG 근거검증(guardrail) — 채점 코멘트가 화법 가이드 코퍼스에 근거하는지 확인
    planner/   S5 — 비동기 세션 리포트(추이·다음 연습 추천) 워커
    retriever/ 런타임 RAG 검색 (pgvector 조회만, 인덱싱은 안 함)
  metrics/     S2 — 결정론적 지표 추출(필러워드/wpm/문장수/침묵), 비-LLM
  orchestration/ LangGraph 4-노드 그래프(extract_metrics→coach_agent→verify_agent→finalize)
  stt/         음성 인식 (Whisper / gpt-4o-transcribe)
  db/
    models/    SQLAlchemy ORM 모델
  core/        설정, 공용 스키마
rag/
  index/       오프라인 인덱싱 — data/rag_corpus(화법 가이드 정제 문서)를 청킹·임베딩·pgvector upsert (수동/배치, 요청 경로 아님)
               원본 문서 정제 자체는 여기 아니라 data/ingest/<source>/ 담당
tests/
```

소유 브랜치: `backend`

> 이전 주제("크로스핏 폼 코치")의 설계 문서는 `docs/old/`에 보존돼 있다(로컬 전용, git 미추적 — `.gitignore`의
> `docs/` 규칙 참고).
