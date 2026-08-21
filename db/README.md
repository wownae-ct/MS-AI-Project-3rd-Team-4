# db

**SQLAlchemy 2.0 async + Alembic** — 스키마의 유일한 출처는 `backend/app/models/`(선언적 모델)이고,
마이그레이션은 `backend/alembic/`에서 관리한다(둘 다 backend의 uv venv/import path가 필요해서
repo-root `db/`가 아니라 `backend/` 아래에 둔다).

```
seed/         체크리스트/타임라인/업체사례 등 콘텐츠성 시드 데이터. 스키마 마이그레이션에 넣지
              않는 이유는 04_DB_spec.md §8 참조 — 콘텐츠는 자주 바뀌므로 별도 스크립트로 재실행 가능해야 함.
              적재 스크립트는 backend/scripts/seed.py(SQLAlchemy 모델 필요, backend venv에서 실행).
old/          BriefCoach 시절 raw-SQL 마이그레이션 도구(migrate.py, migrations/0001~0002) 아카이브.
```

마이그레이션 실행: `cd backend && uv run alembic upgrade head` (DB URL은 alembic.ini가 아니라
`app.core.config.Settings`의 `DATABASE_URL`을 읽는다 — `backend/alembic/env.py` 참조).

백엔드 쿼리는 `backend/app/routers/`→`services/`에서 SQLAlchemy 세션(`app/core/db.py`의
`get_session`)으로 작성한다(raw asyncpg 직접 사용 없음).
