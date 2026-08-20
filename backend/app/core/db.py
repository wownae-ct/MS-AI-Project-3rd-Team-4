"""SQLAlchemy 2.0 async 엔진 + 세션 팩토리. backend/old/app/db/__init__.py(raw asyncpg)를 대체.

AAD 인증 모드는 동일한 패턴 유지: DSN에 비밀번호가 없으면 연결 시점마다 do_connect 이벤트에서
DefaultAzureCredential 토큰을 password로 주입한다(토큰은 ~1시간 후 만료되므로 커넥션마다 새로 받음)."""

import asyncio

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.auth import get_credential
from app.core.config import Settings, get_settings

AAD_PG_SCOPE = "https://ossrdbms-aad.database.windows.net/.default"


def _to_asyncpg_url(database_url: str) -> str:
    if database_url.startswith("postgresql+asyncpg://"):
        return database_url
    if database_url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + database_url[len("postgresql://") :]
    return database_url


def create_engine(settings: Settings) -> AsyncEngine:
    engine = create_async_engine(_to_asyncpg_url(settings.database_url))

    if settings.database_auth_mode == "aad":

        @event.listens_for(engine.sync_engine, "do_connect")
        def _inject_aad_token(dialect, conn_rec, cargs, cparams):
            token = asyncio.run(asyncio.to_thread(get_credential().get_token, AAD_PG_SCOPE))
            cparams["password"] = token.token

    return engine


_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_engine(get_settings())
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_factory


async def get_session() -> AsyncSession:
    """FastAPI 의존성. 사용처: `session: AsyncSession = Depends(get_session)`."""
    async with get_session_factory()() as session:
        yield session
