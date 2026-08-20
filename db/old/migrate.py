"""번호 붙인 SQL 마이그레이션 러너. Alembic 등 프레임워크 없음 — 이 스크립트가 전부다.

asyncpg는 이 파일 자체가 아니라 backend/pyproject.toml이 관리하는 의존성이므로, backend의 uv
가상환경으로 실행한다:

    cd backend && DATABASE_URL=postgresql://user:pass@host/db uv run python ../db/migrate.py

db/migrations/*.sql을 파일명 순서로 적용하고, 적용된 파일명을 schema_migrations 테이블에 기록해
재실행 시 건너뛴다. 각 마이그레이션은 단일 트랜잭션으로 적용된다 — 실패하면 그 파일만 롤백되고
이후 파일은 실행하지 않는다.
"""

import asyncio
import os
import sys
from pathlib import Path

import asyncpg

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


async def apply_migrations(database_url: str) -> None:
    conn = await asyncpg.connect(database_url)
    try:
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations "
            "(filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
        applied = {row["filename"] for row in await conn.fetch("SELECT filename FROM schema_migrations")}

        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if path.name in applied:
                continue
            print(f"applying {path.name}")
            sql = path.read_text(encoding="utf-8")
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute("INSERT INTO schema_migrations (filename) VALUES ($1)", path.name)
    finally:
        await conn.close()


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL 환경변수가 필요합니다.", file=sys.stderr)
        sys.exit(1)
    asyncio.run(apply_migrations(database_url))


if __name__ == "__main__":
    main()
