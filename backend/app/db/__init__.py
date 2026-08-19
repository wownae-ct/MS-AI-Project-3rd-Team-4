"""asyncpg 커넥션 풀. ORM 없이 순수 SQL — 쿼리는 app/db/queries/에 함수로 작성한다.
스키마는 db/migrations/의 번호 붙인 SQL 파일 + db/migrate.py 러너로 관리(Alembic 등 프레임워크 없음)."""

import asyncio

import asyncpg

from app.core.auth import get_credential
from app.core.config import Settings

# Azure Database for PostgreSQL의 AAD 토큰 스코프. 로컬 개발은 database_auth_mode="password"라
# DSN에 이미 비밀번호가 있어서 이 스코프를 안 씀 — 클러스터(AAD)에서만 쓰인다.
AAD_PG_SCOPE = "https://ossrdbms-aad.database.windows.net/.default"


async def _resolve_password(settings: Settings) -> str | None:
    if settings.database_auth_mode == "password":
        return None  # DSN에 이미 비밀번호 포함(db/migrate.py와 동일 방식)
    # get_credential()이 반환하는 DefaultAzureCredential은 동기 클라이언트라 to_thread로 감싸서
    # 이벤트 루프를 블로킹하지 않는다.
    token = await asyncio.to_thread(get_credential().get_token, AAD_PG_SCOPE)
    return token.token


async def get_connection(settings: Settings) -> asyncpg.Connection:
    password = await _resolve_password(settings)
    return await asyncpg.connect(dsn=settings.database_url, password=password)
