"""#6-10 — 03_API_spec.md ① 웨딩 핵심(온보딩, 조회/수정, 카테고리 On/Off·예산). v4.0: wedding_id는
항상 세션에서 서버가 유도(get_current_wedding) — URL/body에 없다."""

from fastapi import APIRouter, Depends, Request, status
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
    create_wedding as create_wedding_service,
)
from app.services.wedding import (
    list_wedding_categories_out,
)
from app.services.wedding import (
    update_wedding as update_wedding_service,
)
from app.services.wedding import (
    update_wedding_categories as update_wedding_categories_service,
)

router = APIRouter(tags=["wedding"])


@router.post("/weddings", response_model=WeddingOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute", key_func=user_or_ip_key)
# 17_qa_e2e_test_plan.md §10-2/§14-2 — 온보딩 1회당 LLM 호출(개인화 그래프)이 걸리는 엔드포인트
# (Phase 1 실측 17.5~28.76s). 계정 기준 제한 — Azure OpenAI 비용 선형 증가 방지.
async def create_wedding(
    request: Request,
    payload: WeddingCreate,
    user: User = Depends(get_current_user),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> Wedding:
    return await create_wedding_service(session, get_settings(), user, payload)


@router.get("/weddings/me", response_model=WeddingOut)
async def get_wedding(wedding: Wedding = Depends(get_current_wedding)) -> Wedding:  # noqa: B008
    return wedding


@router.patch("/weddings/me", response_model=WeddingOut)
async def update_wedding(
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
async def update_wedding_categories(
    payload: WeddingCategoriesUpdate,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> WeddingCategoriesOut:
    categories = await update_wedding_categories_service(session, get_settings(), wedding, payload)
    return WeddingCategoriesOut(categories=categories)
