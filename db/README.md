# db

**ORM 없이 순수 SQL** (asyncpg). 스키마는 번호 붙인 마이그레이션 SQL 파일로 관리한다 — Alembic 등
프레임워크 없음.

```
migrations/   0001_init.sql부터 번호 순서로 적용되는 DDL. 이 폴더가 스키마의 유일한 출처.
migrate.py    러너 — asyncpg는 backend 의존성이라 `cd backend && uv run python ../db/migrate.py`로 실행.
seed/         초기 질문 뱅크 등 시드 데이터 (SQL INSERT 스크립트)
```

백엔드 쿼리 함수는 `backend/app/db/queries/`에 테이블/기능 단위로 작성한다(ORM 매핑 없이
`asyncpg.Record` 직접 사용).
