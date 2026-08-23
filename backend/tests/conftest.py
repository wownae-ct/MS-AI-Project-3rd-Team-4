"""FastAPI 앱을 실제 서버 기동 없이 ASGI로 직접 두드리는 스모크 테스트 공용 픽스처.

09_backend_implementation_plan.md §4/§6 DoD: "TestClient로 엔드포인트가 200/201을 반환하는가"
스모크 테스트를 mock DB가 아니라 실제 DB에 대해 실행한다. 로컬에서는 backend/.env가 가리키는
DB(개발자가 평소 실DB 검증에 쓰는 것과 동일)를 그대로 쓰고, CI(backend-ci.yml)에서는
pgvector/pgvector 서비스 컨테이너로 매 실행마다 빈 DB에 마이그레이션을 새로 적용한 뒤 돈다
(2026-08-24, PR #37 CI 실패로 발견해 추가)."""

from collections.abc import AsyncIterator, Callable, Coroutine
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

API_PREFIX = "/api/v1"


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    # https(실제 TLS는 없음, ASGITransport가 in-process로 호출만 함) — auth 쿠키가
    # Secure 플래그로 내려오므로(app/routers/auth.py) http면 httpx 쿠키 저장소가 후속
    # 요청에 쿠키를 아예 안 실어 보낸다(2026-08-24 chat 스모크 작성 중 401로 발견).
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url=f"https://testserver{API_PREFIX}") as ac:
        yield ac


async def _signup_and_create_wedding(client: AsyncClient) -> AsyncClient:
    """회원가입(#2) → 웨딩 생성(#6)까지 마친 인증된 클라이언트를 만든다. httpx AsyncClient는
    응답의 Set-Cookie를 자체 쿠키 저장소에 담아 이후 요청에 자동으로 실어 보낸다(요청마다
    cookies=를 직접 넘길 필요 없음).

    실DB에 테스트 유저 1행 + 웨딩 1행(+wedding_categories 9행, timeline_items 55행)이 호출마다
    쌓인다 — 이 프로젝트에 아직 테스트 DB 정리/롤백 인프라가 없어(conftest.py 최초 도입, 별도
    테스트 DB 컨테이너도 없음) 지금은 감수한다. 데이터가 쌓이는 게 신경 쓰이면 이메일에 실린
    uuid4로 나중에 골라 지울 수 있다."""
    unique = uuid4().hex[:12]
    await client.post(
        "/auth/signup",
        json={
            "email": f"smoke-{unique}@example.com",
            "password": "smoke-test-password",
            "display_name": "스모크테스트",
        },
    )
    await client.post(
        "/weddings",
        json={
            "user_role": "BRIDE",
            "wedding_date": "2027-05-01",
            "wedding_date_precision": "EXACT",
            "total_budget": 50000000,
            "region_code": "SEOUL_GANGNAM",
        },
    )
    return client


@pytest.fixture
async def wedding_client(client: AsyncClient) -> AsyncClient:
    """웨딩 종속 엔드포인트(chat 등) 스모크 테스트가 공유하는 단일 인증 클라이언트."""
    return await _signup_and_create_wedding(client)


@pytest.fixture
async def make_wedding_client() -> AsyncIterator[Callable[[], Coroutine[None, None, AsyncClient]]]:
    """서로 다른 두 유저(=서로 다른 웨딩)가 필요한 소유권 검증 테스트(예: 남의 chat_session
    조회 시 404)를 위한 팩토리 — 호출할 때마다 신규 유저+웨딩으로 독립된 클라이언트를 만든다."""

    clients: list[AsyncClient] = []

    async def _make() -> AsyncClient:
        transport = ASGITransport(app=app)
        ac = AsyncClient(transport=transport, base_url=f"https://testserver{API_PREFIX}")
        clients.append(ac)
        return await _signup_and_create_wedding(ac)

    yield _make

    for ac in clients:
        await ac.aclose()
