# backend

FastAPI(asyncio) 게이트웨이. SQLAlchemy 2.0 async + Alembic — 스키마는 `app/models/`(선언적
모델)이 유일한 출처, 마이그레이션은 `alembic/`(`db/` 참고). 인증은 이메일+비밀번호(BFF +
Opaque 세션 쿠키) + 소셜 로그인(구글·네이버 라이브, 카카오·애플은 구현 완료·머지 보류)이다 —
"인증 없음"이던 초기 스코프는 BASELINE v4.0에서 뒤집혔다.

```
app/
  main.py      FastAPI app 인스턴스 (Dockerfile CMD가 가리키는 지점) — CORS·rate limit·전역
               예외 핸들러(마지막 단이 catch-all 500 로거) 설정
  deps.py      공용 의존성 — get_current_user(세션 쿠키 wr_session) → get_current_wedding
               (소유권 검증) 체인. "시드된 단일 weddings 행" 시절은 지났다
  routers/     38개 엔드포인트(OpenAPI 노출 36개; OAuth 리다이렉트 2개는 스키마 비노출) —
               도메인별 서브패키지로 재구성(2026-08-26):
                 system/    health, client-errors(미인증, 20/min per-IP)
                 wedding/   wedding, category, checklist, timeline,
                            budget(결제 CRUD+영수증 OCR 자동입력+벤치마크), dashboard,
                            vendor_case
                 ai/        chat(RAG SSE 스트리밍+세션 목록+메시지 평점), personalization
                            (수동 재생성), feedback
                 auth.py    이메일/비밀번호 + 구글·네이버 OAuth(BFF)
  services/    비즈니스 로직(라우터가 얇게 유지되도록) — 전 도메인 채워짐
  schemas/     Pydantic v2 요청/응답 스키마 — 전 도메인 채워짐
  models/      SQLAlchemy 2.0 선언적 모델, 16개 테이블(rag_index_state 포함)
  rag/         corpus.py(코퍼스 파싱·검증·해시) → indexing.py(rag-reindex CronJob 진입점,
               해시 불변 시 재색인 스킵) / retrieval.py(하이브리드 검색+RRF, pgvector HNSW) /
               scope_check.py(스코프 밖 요청 사전 차단) / graph.py(retrieve→generate→verify
               LangGraph 3노드, CRAG 조건부 재시도 ≤1회, OUT_OF_SCOPE 판정 포함)
  personalization/  체크리스트/타임라인 전담 LangGraph 3노드(route→generate→validate) —
               도메인별·카테고리별 독립 호출로 분리(결합 호출이 BLOCKED 연쇄 실패의 근본
               원인이었음을 확인 후 조치), 조건부 재시도(≤1회), 카탈로그 폴백
               (core/checklist_catalog.py 95항목 / core/timeline_catalog.py 87항목)
  core/        설정(config.py), DB 엔진/세션(db.py), 세션 인증(auth.py)/OAuth 프로바이더
               (oauth_providers.py), rate_limit.py, 임베딩 클라이언트(embeddings.py), Blob
               Storage(storage.py), KST 헬퍼(timezone.py), Langfuse 트레이싱(tracing.py),
               카테고리 ENUM(categories.py), 에러 응답 헬퍼(errors.py), SSE 헬퍼(sse.py)
  old/         BriefCoach(2026-08-19 피벗) 구현 아카이브 — ruff/pytest 대상 제외, 참고용
alembic/       마이그레이션. DB URL은 alembic.ini가 아니라 app.core.config.Settings에서 읽는다
tests/         라우터/서비스/RAG/개인화/OAuth 전 도메인 커버 — 일부는 실 DB·실 LLM 대상
scripts/       seed_vendor_cases.py / seed_price_benchmarks.py(콘텐츠 시드),
               corpus_md_to_json.py(코퍼스 .md → .json 변환 — indexing.py가 실제로 읽는 건 .json)
```

소유 브랜치: `backend`

> 이전 두 주제("크로스핏 폼 코치", "브리프코치")는 각각 `docs/old/`(로컬 전용, git 미추적)와
> `backend/old/`(git 추적, lint/test 제외)에 보존돼 있다.
