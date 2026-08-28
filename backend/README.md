# backend

FastAPI(asyncio) 게이트웨이. SQLAlchemy 2.0 async + Alembic — 스키마는 `app/models/`(선언적
모델)이 유일한 출처, 마이그레이션은 `alembic/`(`db/` 참고).

```
app/
  main.py      FastAPI app 인스턴스 (Dockerfile CMD가 가리키는 지점)
  deps.py      공용 의존성 — 인증이 없으므로 "로그인 사용자"가 아니라 시드된 단일 weddings 행
  routers/     health/wedding/category/budget/vendor_case/chat/dashboard — 23개 엔드포인트
               (docs/wedding/plan/03_API_spec.md), 현재 대부분 501 스텁
  services/    비즈니스 로직(라우터가 얇게 유지되도록) — Phase 1부터 채워짐, 현재 빈 패키지
  schemas/     Pydantic v2 요청/응답 스키마 — Phase 1부터 채워짐, 현재 빈 패키지
  models/      SQLAlchemy 2.0 선언적 모델, 14개 테이블(docs/wedding/plan/04_DB_spec.md §7)
  rag/         retrieve(하이브리드 검색+RRF) → generate → verify LangGraph 3노드
               (docs/wedding/plan/05_RAG_design.md), indexing.py는 rag-reindex CronJob 진입점
  core/        설정(config.py), DB 엔진/세션(db.py), Azure AAD 인증(auth.py), 임베딩 클라이언트
  old/         BriefCoach(2026-08-19 피벗) 구현 아카이브 — ruff/pytest 대상 제외, 참고용
alembic/       마이그레이션. DB URL은 alembic.ini가 아니라 app.core.config.Settings에서 읽는다
tests/
```

소유 브랜치: `backend`

> 이전 두 주제("크로스핏 폼 코치", "브리프코치")는 각각 `docs/old/`(로컬 전용, git 미추적)와
> `backend/old/`(git 추적, lint/test 제외)에 보존돼 있다.
