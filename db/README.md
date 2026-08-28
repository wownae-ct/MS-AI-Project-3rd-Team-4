# db

**SQLAlchemy 2.0 async + Alembic** — 스키마의 유일한 출처는 `backend/app/models/`(선언적 모델)이고,
마이그레이션은 `backend/alembic/`에서 관리한다(둘 다 backend의 uv venv/import path가 필요해서
repo-root `db/`가 아니라 `backend/` 아래에 둔다).

```
seed/         비어 있음(2026-08-24 기준). v3.0 시절엔 체크리스트/타임라인/업체사례 콘텐츠 시드를
              여기 두고 backend/scripts/seed.py로 적재했지만, v4.0에서 checklist_items/
              timeline_items가 웨딩별 개인화 라우터 에이전트(route→generate→validate,
              app/services/personalization.py) 생성으로 바뀌면서 공유 마스터 시드 자체가
              없어졌다 — seed.py도 삭제됐다. 여전히 콘텐츠성 시드가 필요한 건 업체사례(F10)와
              참가격(price_benchmarks)뿐이고, 둘 다 db/seed/ CSV가 아니라 backend/scripts/
              seed_vendor_cases.py·seed_price_benchmarks.py가 각자 자기 데이터 소스(data/
              rag_corpus, data/raw/참가격데이터)에서 직접 적재한다(backend venv에서 실행).
old/          BriefCoach 시절 raw-SQL 마이그레이션 도구(migrate.py, migrations/0001~0002) 아카이브.
```

마이그레이션 실행: `cd backend && uv run alembic upgrade head` (DB URL은 alembic.ini가 아니라
`app.core.config.Settings`의 `DATABASE_URL`을 읽는다 — `backend/alembic/env.py` 참조).

백엔드 쿼리는 `backend/app/routers/`→`services/`에서 SQLAlchemy 세션(`app/core/db.py`의
`get_session`)으로 작성한다(raw asyncpg 직접 사용 없음).
