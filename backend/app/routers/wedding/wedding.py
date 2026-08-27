"""#6-10 — 03_API_spec.md ① 웨딩 핵심(온보딩, 조회/수정, 카테고리 On/Off·예산). v4.0: wedding_id는
항상 세션에서 서버가 유도(get_current_wedding) — URL/body에 없다.

2026-08-28 — POST /weddings는 더 이상 평범한 JSON 응답이 아니다(SSE, text/event-stream).
app/services/wedding.py::stream_wedding_creation() 모듈 docstring 참고 — 온보딩 동기 개인화
LLM 호출(p95=45.9초)의 타임아웃 위험 대응, chat SSE heartbeat와 동일 패턴. 성공은
`event: done`(WeddingOut), 실패(409/400 등)는 `event: error`로 온다 — HTTP 상태코드로는
더 이상 성패를 구분할 수 없다(03_API_spec.md #6 갱신 완료 — Request Body categories 필드
문서화 누락도 같이 고침)."""

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session
from app.core.rate_limit import limiter, user_or_ip_key
from app.deps import get_current_user, get_current_wedding
from app.models import User, Wedding
from app.schemas.wedding import (
    WeddingCategoriesOut,
    WeddingCategoriesUpdate,
    WeddingCreate,
    WeddingOut,
    WeddingUpdate,
)
from app.services.wedding import (
    list_wedding_categories_out,
    stream_wedding_creation,
)
from app.services.wedding import (
    update_wedding as update_wedding_service,
)
from app.services.wedding import (
    update_wedding_categories as update_wedding_categories_service,
)

router = APIRouter(tags=["wedding"])


@router.post("/weddings")
@limiter.limit("10/minute", key_func=user_or_ip_key)
# 17_qa_e2e_test_plan.md §10-2/§14-2 — 온보딩 1회당 LLM 호출(개인화 그래프)이 걸리는 엔드포인트
# (Phase 1 실측 17.5~28.76s). 계정 기준 제한 — Azure OpenAI 비용 선형 증가 방지. SSE 전환
# 이후에도 이 데코레이터는 응답 스트리밍 여부와 무관하게 핸들러 호출 자체를 제한한다.
async def create_wedding(
    request: Request,
    payload: WeddingCreate,
    user: User = Depends(get_current_user),  # noqa: B008
) -> StreamingResponse:
    # session은 일부러 Depends(get_session)으로 주입받지 않는다 — stream_wedding_creation()
    # 모듈 docstring 참고(StreamingResponse 핸들러가 리턴하는 즉시 주입된 세션이 닫혀버리는
    # 문제, chat과 동일 패턴).
    return StreamingResponse(
        stream_wedding_creation(get_settings(), user, payload),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"},
    )


@router.get("/weddings/me", response_model=WeddingOut)
async def get_wedding(wedding: Wedding = Depends(get_current_wedding)) -> Wedding:  # noqa: B008
    return wedding


@router.patch("/weddings/me", response_model=WeddingOut)
@limiter.limit("10/minute", key_func=user_or_ip_key)
# 2026-08-26 레드팀 감사 3라운드 HIGH #3 — 날짜 외 필드 변경은 개인화 라우터 에이전트(LLM 호출,
# app/services/wedding.py::update_wedding의 FIELD_UPDATED 재트리거)를 부를 수 있는데도 전역
# 60/분 기본값만 적용받고 있었다. POST /weddings(#6)와 같은 계정당 10/분으로 맞춘다.
async def update_wedding(
    request: Request,
    payload: WeddingUpdate,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> Wedding:
    return await update_wedding_service(session, get_settings(), wedding, payload)


@router.get("/wedding-categories", response_model=WeddingCategoriesOut)
async def list_wedding_categories(
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> WeddingCategoriesOut:
    return WeddingCategoriesOut(categories=await list_wedding_categories_out(session, wedding.id))


@router.put("/wedding-categories", response_model=WeddingCategoriesOut)
@limiter.limit("10/minute", key_func=user_or_ip_key)
# 2026-08-26 레드팀 감사 3라운드 HIGH #4 — 카테고리 토글마다 개인화 라우터 에이전트(LLM 호출,
# app/services/wedding.py::update_wedding_categories의 FIELD_UPDATED 재트리거)가 불릴 수 있어
# update_wedding과 동일한 이유로 계정당 10/분을 건다.
async def update_wedding_categories(
    request: Request,
    payload: WeddingCategoriesUpdate,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> WeddingCategoriesOut:
    categories = await update_wedding_categories_service(session, get_settings(), wedding, payload)
    return WeddingCategoriesOut(categories=categories)
