"""SQLAlchemy 2.0 async 엔진 + 세션 팩토리. backend/old/app/db/__init__.py(raw asyncpg)를 대체.

AAD 인증 모드는 동일한 패턴 유지: DSN에 비밀번호가 없으면 연결 시점마다 do_connect 이벤트에서
DefaultAzureCredential 토큰을 password로 주입한다(토큰은 ~1시간 후 만료되므로 커넥션마다 새로 받음)."""

import logging
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.auth import get_credential
from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

AAD_PG_SCOPE = "https://ossrdbms-aad.database.windows.net/.default"

# SQLAlchemy 기본값(pool_size=5, max_overflow=10 → 최대 15개)은 25명 동접 부하테스트에서
# 저렴한 CRUD 조회조차 커넥션 대기로 p95가 3~4.4초까지 치솟는 원인이었다(2026-08-25,
# 17_qa_e2e_test_plan.md §16). 실측 Postgres max_connections=429(당시 활성 연결 21개)라
# 여유가 충분해, 레플리카당 50개(=20+30)로 올려도 staging+production이 같은 인스턴스를
# 공유해도 안전하다.
_DB_POOL_SIZE = 20
_DB_POOL_MAX_OVERFLOW = 30


def _to_asyncpg_url(database_url: str) -> str:
    if database_url.startswith("postgresql://"):
        database_url = "postgresql+asyncpg://" + database_url[len("postgresql://") :]
    elif not database_url.startswith("postgresql+asyncpg://"):
        return database_url

    # asyncpg는 libpq의 ?sslmode=require를 모른다("unexpected keyword argument 'sslmode'",
    # 실측 확인) — 쿼리스트링에서 빼고 create_engine()에서 connect_args={"ssl": ...}로 넘긴다.
    parts = urlsplit(database_url)
    query = [(k, v) for k, v in parse_qsl(parts.query) if k != "sslmode"]
    return urlunsplit(parts._replace(query=urlencode(query)))


def _wants_ssl(database_url: str) -> bool:
    sslmode = dict(parse_qsl(urlsplit(database_url).query)).get("sslmode")
    return sslmode is not None and sslmode != "disable"


def create_engine(settings: Settings) -> AsyncEngine:
    connect_args = {"ssl": "require"} if _wants_ssl(settings.database_url) else {}
    engine = create_async_engine(
        _to_asyncpg_url(settings.database_url),
        connect_args=connect_args,
        pool_size=_DB_POOL_SIZE,
        max_overflow=_DB_POOL_MAX_OVERFLOW,
    )

    if settings.database_auth_mode == "aad":

        @event.listens_for(engine.sync_engine, "do_connect")
        def _inject_aad_token(dialect, conn_rec, cargs, cparams):
            # do_connect는 AsyncEngine에서도 SQLAlchemy의 greenlet 브릿지를 통해 동기적으로
            # 실행된다 — 이미 실행 중인 이벤트 루프와 같은 스레드(다른 greenlet 스택)에서 돌아가므로
            # asyncio.run()을 쓰면 "cannot be called from a running event loop"로 항상 깨진다
            # (실제로 rag-reindex CronJob에서 재현됨). get_token()은 원래 동기 함수라 그냥 직접
            # 호출하면 된다 — asyncio로 감쌀 이유가 없다.
            # 2026-08-26 레드팀 감사 4라운드 항목 16 — 토큰 발급 자체가 실패하면(Managed
            # Identity 미부여 등) 이전엔 무로깅이라 DB 자체 장애와 구분이 안 됐다.
            try:
                cparams["password"] = get_credential().get_token(AAD_PG_SCOPE).token
            except Exception:
                logger.exception("Failed to acquire AAD token for Postgres connection")
                raise

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
