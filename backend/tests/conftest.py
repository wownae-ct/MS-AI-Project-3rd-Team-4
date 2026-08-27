"""FastAPI 앱을 실제 서버 기동 없이 ASGI로 직접 두드리는 스모크 테스트 공용 픽스처.

09_backend_implementation_plan.md §4/§6 DoD: "TestClient로 엔드포인트가 200/201을 반환하는가"
스모크 테스트를 mock DB가 아니라 실제 DB에 대해 실행한다. 로컬에서는 backend/.env가 가리키는
DB(개발자가 평소 실DB 검증에 쓰는 것과 동일)를 그대로 쓰고, CI(backend-ci.yml)에서는
pgvector/pgvector 서비스 컨테이너로 매 실행마다 빈 DB에 마이그레이션을 새로 적용한 뒤 돈다
(2026-08-24, PR #37 CI 실패로 발견해 추가)."""

import json
from collections.abc import AsyncIterator, Callable, Coroutine
from datetime import date
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.categories import CATEGORY_META
from app.core.db import get_session_factory
from app.core.rate_limit import limiter
from app.main import app
from app.models import ChatMessage, PriceBenchmark

API_PREFIX = "/api/v1"


def parse_sse_frames(text: str) -> list[tuple[str | None, dict | str]]:
    """text/event-stream 바디를 (event, data) 튜플 리스트로 파싱한다. `:`로 시작하는
    heartbeat 주석 줄은 (None, 원문)으로 남긴다. app/services/wedding.py::stream_wedding_creation
    (2026-08-28)/app/services/chat.py처럼 SSE로 응답하는 엔드포인트를 테스트하는 곳(test_smoke.py,
    test_wedding_service.py)이 공유한다."""
    parsed: list[tuple[str | None, dict | str]] = []
    for block in text.split("\n\n"):
        if not block:
            continue
        if block.startswith(":"):
            parsed.append((None, block[1:].strip()))
            continue
        event_name, data_line = None, None
        for line in block.split("\n"):
            if line.startswith("event:"):
                event_name = line.removeprefix("event:").strip()
            elif line.startswith("data:"):
                data_line = line.removeprefix("data:").strip()
        if event_name is not None and data_line is not None:
            parsed.append((event_name, json.loads(data_line)))
    return parsed


# 스모크 테스트는 같은 ASGITransport 클라이언트로 회원가입/로그인/웨딩 생성을 매 테스트마다
# 반복 호출한다(위 독스트링 — 테스트 DB 정리/롤백 인프라가 아직 없어 실DB에 계속 쌓는 방식).
# ASGITransport 하에서는 request.client가 없어(또는 고정값) app/core/rate_limit.py의 IP 키가
# 테스트 전체에서 사실상 하나로 묶이므로, app/core/rate_limit.py::limiter의 실 rate limit이
# 그대로 켜져 있으면 무관한 테스트끼리 서로의 호출 횟수를 갉아먹어 순서에 따라 간헐적으로
# 429가 나는 깨지기 쉬운 테스트가 된다. 이 프로젝트에 아직 "테스트 전용 설정 오버라이드"
# 컨벤션이 없어(app/core/config.py에 그런 필드가 없음) slowapi 자체가 제공하는 런타임
# on/off 스위치(limiter.enabled)로 세션 전체에서 끈다 — 실 서버(uvicorn 기동)는 이 모듈을
# import하지 않으므로 프로덕션 동작에는 영향이 없다.
limiter.enabled = False

# scripts/seed_price_benchmarks.py가 ETL로 채우는 실 데이터는 로컬 dev DB에만 있고, CI
# (backend-ci.yml)는 마이그레이션만 적용된 빈 DB로 돈다 — GET /benchmarks/total-average
# 스모크 테스트가 로컬에선 통과하고 CI에서만 404로 떨어진 원인(PR #41). 2099-01-01처럼 실
# 데이터가 절대 못 따라올 미래 날짜를 써서 get_latest_benchmark()의 "survey_month 최신순"
# 선택 로직이 로컬 실데이터 유무와 무관하게 항상 이 행을 고르게 한다.
_SMOKE_TOTAL_BENCHMARK_SURVEY_MONTH = date(2099, 1, 1)


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    # https(실제 TLS는 없음, ASGITransport가 in-process로 호출만 함) — auth 쿠키가
    # Secure 플래그로 내려오므로(app/routers/auth.py) http면 httpx 쿠키 저장소가 후속
    # 요청에 쿠키를 아예 안 실어 보낸다(2026-08-24 chat 스모크 작성 중 401로 발견).
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url=f"https://testserver{API_PREFIX}") as ac:
        yield ac


async def _signup(client: AsyncClient) -> AsyncClient:
    """회원가입(#2)만 마친 인증된 클라이언트 — 아직 웨딩이 없는 온보딩 이전 상태. httpx
    AsyncClient는 응답의 Set-Cookie를 자체 쿠키 저장소에 담아 이후 요청에 자동으로 실어
    보낸다(요청마다 cookies=를 직접 넘길 필요 없음).

    실DB에 테스트 유저 1행이 호출마다 쌓인다 — 이 프로젝트에 아직 테스트 DB 정리/롤백
    인프라가 없어(conftest.py 최초 도입, 별도 테스트 DB 컨테이너도 없음) 지금은 감수한다.
    데이터가 쌓이는 게 신경 쓰이면 이메일에 실린 uuid4로 나중에 골라 지울 수 있다."""
    unique = uuid4().hex[:12]
    await client.post(
        "/auth/signup",
        json={
            "email": f"smoke-{unique}@example.com",
            # 2026-08-26 레드팀 감사 대응으로 SignupRequest.password에 영문+숫자+특수문자
            # 조합 검증이 생겨, 조합 없는 값이던 기존 픽스처가 422로 막혀 이 픽스처를 쓰는
            # 모든 테스트가 401로 줄줄이 실패했었다 — 조합 요건을 만족하는 값으로 교체.
            "password": "smoke-test-password-1!",
            "display_name": "스모크테스트",
        },
    )
    return client


async def _signup_and_create_wedding(client: AsyncClient) -> AsyncClient:
    """회원가입(#2) → 웨딩 생성(#6)까지 마친 인증된 클라이언트를 만든다. 웨딩 생성이 추가로
    실DB에 웨딩 1행(+wedding_categories 9행, timeline_items 55행)을 쌓는다 — 데이터 적재에
    대한 나머지 설명은 _signup 참고.

    2026-08-27 재설계로 categories가 POST /weddings의 필수 필드가 됐다 — 이 픽스처를 쓰는
    기존 테스트들(예: test_dashboard_summary_returns_200_with_all_categories_active)이 "9개
    전부 활성·0원"이라는 예전 하드코딩 기본값을 그대로 가정하므로, 그 기본값을 여기서 명시적으로
    재현한다(CATEGORY_META가 단일 소스)."""
    await _signup(client)
    await client.post(
        "/weddings",
        json={
            "user_role": "BRIDE",
            "wedding_date": "2027-05-01",
            "wedding_date_precision": "EXACT",
            "total_budget": 50000000,
            "region_code": "SEOUL_GANGNAM",
            "categories": [
                {
                    "category_code": meta.code,
                    "is_active": True,
                    "planned_budget": 0,
                    "display_order": meta.display_order,
                }
                for meta in CATEGORY_META
            ],
        },
    )
    return client


@pytest.fixture
async def total_budget_benchmark() -> AsyncIterator[None]:
    """GET /benchmarks/total-average(#31) 스모크 테스트가 의존하는 price_benchmarks TOTAL 행을
    SEOUL_GANGNAM에 upsert한다 — CI엔 ETL 시드가 없어 이 행이 아예 없으므로 직접 만들어야
    한다(위 _SMOKE_TOTAL_BENCHMARK_SURVEY_MONTH 설명 참고). on_conflict_do_update로 멱등
    처리해 로컬에서 반복 실행해도 유니크 제약 위반이 안 난다 —
    scripts/seed_price_benchmarks.py::_upsert_rows와 동일한 패턴.

    이 fixture는 다른 스모크 fixture들과 달리 테스트 종료 후 행을 지운다(테스트 자체 스코프
    로만 존재) — 다른 것들(유저/웨딩 등)과 달리 이건 "고아 데이터가 쌓이는" 수준이 아니라,
    SEOUL_GANGNAM/TOTAL의 `_resolve_total_budget`(`POST /weddings`의 미정 처리)이 실제로
    읽는 최신 행을 조작하는 것이라 로컬 dev DB에 남으면 팀원의 수동 검증 결과를 왜곡한다."""
    async with get_session_factory()() as session:
        stmt = pg_insert(PriceBenchmark).values(
            survey_month=_SMOKE_TOTAL_BENCHMARK_SURVEY_MONTH,
            region_code="SEOUL_GANGNAM",
            category_code="TOTAL",
            item_code="TOTAL",
            median_price=45_000_000,
            min_price=30_000_000,
            max_price=60_000_000,
            sample_count=42,
            source_url="https://example.com/price-benchmarks-smoke-test",
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["survey_month", "region_code", "category_code", "item_code"],
            set_={"median_price": stmt.excluded.median_price},
        )
        await session.execute(stmt)
        await session.commit()

    yield

    async with get_session_factory()() as session:
        await session.execute(
            delete(PriceBenchmark).where(
                PriceBenchmark.survey_month == _SMOKE_TOTAL_BENCHMARK_SURVEY_MONTH,
                PriceBenchmark.region_code == "SEOUL_GANGNAM",
                PriceBenchmark.category_code == "TOTAL",
                PriceBenchmark.item_code == "TOTAL",
            )
        )
        await session.commit()


@pytest.fixture
async def signed_up_client(client: AsyncClient) -> AsyncClient:
    """웨딩 생성 전 온보딩 단계 엔드포인트(예: GET /benchmarks/total-average) 스모크 테스트용
    — 로그인만 마치고 웨딩은 아직 없는 클라이언트."""
    return await _signup(client)


@pytest.fixture
async def wedding_client(client: AsyncClient) -> AsyncClient:
    """웨딩 종속 엔드포인트(chat 등) 스모크 테스트가 공유하는 단일 인증 클라이언트."""
    return await _signup_and_create_wedding(client)


@pytest.fixture
async def make_assistant_message() -> AsyncIterator[
    Callable[..., Coroutine[None, None, tuple[str, str]]]
]:
    """(session_id, message_id) 문자열 쌍을 만들어 준다. 세션은 실제 API(POST /chat/sessions)로
    만들어 소유권 배선을 그대로 타게 하고, 메시지 행만 직접 insert한다 — #29 실LLM 스트리밍은
    비용/지연 때문에 자동 스모크 대상이 아니라(test_smoke.py TestChatSessionsSmoke docstring)
    assistant 메시지를 API 호출만으로 만들 방법이 없기 때문. 직접 insert 자체는
    total_budget_benchmark 픽스처와 동일한 패턴이다.

    테스트가 끝나면 만든 메시지 행만 지운다(세션/유저/웨딩은 다른 픽스처들과 같은 컨벤션대로
    남겨둔다)."""
    created_ids: list[UUID] = []

    async def _make(
        ac: AsyncClient, *, role: str = "assistant", trace_ref: str | None = None
    ) -> tuple[str, str]:
        session_response = await ac.post("/chat/sessions", json={"category_code": "VENUE"})
        session_id = session_response.json()["id"]

        async with get_session_factory()() as session:
            message = ChatMessage(
                session_id=session_id,
                role=role,
                content="스모크 테스트 메시지",
                trace_ref=trace_ref,
            )
            session.add(message)
            await session.commit()
            await session.refresh(message)
            created_ids.append(message.id)
            message_id = str(message.id)

        return session_id, message_id

    yield _make

    async with get_session_factory()() as session:
        await session.execute(delete(ChatMessage).where(ChatMessage.id.in_(created_ids)))
        await session.commit()


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
