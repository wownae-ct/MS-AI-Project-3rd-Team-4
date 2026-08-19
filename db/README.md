# db

**ORM 사용** (SQLAlchemy async + asyncpg 드라이버). 마이그레이션 파일 없음 — 스키마는
`backend/app/db/models/`의 ORM 모델에서 직접 생성한다(Base.metadata.create_all).

```
seed/   초기 카탈로그 데이터 (movement, fault_code 등) — ORM으로 삽입
```
