"""asyncpg 커넥션 풀. ORM 없이 순수 SQL — 쿼리는 app/db/queries/에 함수로 작성한다.
스키마는 db/migrations/의 번호 붙인 SQL 파일 + db/migrate.py 러너로 관리(Alembic 등 프레임워크 없음)."""
