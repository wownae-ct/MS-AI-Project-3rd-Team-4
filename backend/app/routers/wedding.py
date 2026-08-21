"""#2-6 — 03_API_spec.md §3. 온보딩(웨딩 프로필 생성/조회/수정)과 카테고리 On/Off·예산 배분.

09_backend_implementation_plan.md Phase 1 범위: 온보딩 관련 엔드포인트(#2, #6)만 실제 DB 로직
(app/services/wedding.py)으로 교체, #3/#4/#5는 아직 목 응답 — API 명세서 §3 예시 JSON을
그대로 반환해 프론트가 화면 형태를 보고 작업할 수 있게 한다(실 DB 연동은 Phase 2)."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.deps import get_the_wedding
from app.models import Wedding
from app.routers._mock import MOCK_CATEGORIES, MOCK_WEDDING_ID
from app.schemas.wedding import (
    WeddingCategoriesOut,
    WeddingCategoriesUpdate,
    WeddingCategoryOut,
    WeddingCreate,
    WeddingOut,
    WeddingUpdate,
)
from app.services.wedding import create_wedding as create_wedding_service
from app.services.wedding import update_wedding_categories as update_wedding_categories_service

router = APIRouter(tags=["wedding"])

_MOCK_CREATED_AT = datetime(2026, 8, 20, 5, 0, 0, tzinfo=UTC)


def _mock_wedding_out() -> WeddingOut:
    return WeddingOut(
        id=MOCK_WEDDING_ID,
        wedding_date="2027-05-15",
        date_precision="EXACT",
        total_budget=45_000_000,
        region_code="SEOUL_GANGNAM",
        guest_count=200,
        user_role="BRIDE",
        taste_preference="BALANCED",
        venue_priority="LOCATION",
        sdm_priority="DRESS",
        created_at=_MOCK_CREATED_AT,
    )


@router.post("/weddings", response_model=WeddingOut, status_code=status.HTTP_201_CREATED)
async def create_wedding(
    payload: WeddingCreate,
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> Wedding:
    return await create_wedding_service(session, payload)


@router.get("/weddings/me", response_model=WeddingOut)
async def get_wedding() -> WeddingOut:
    """목 응답(Phase 1) — Phase 2에서 get_the_wedding 의존성으로 교체 예정."""
    return _mock_wedding_out()


@router.patch("/weddings/me", response_model=WeddingOut)
async def update_wedding(payload: WeddingUpdate) -> WeddingOut:
    """목 응답(Phase 1) — 요청으로 들어온 필드만 mock 위에 얹어 돌려준다(부분수정 체감용)."""
    return _mock_wedding_out().model_copy(update=payload.model_dump(exclude_unset=True))


@router.get("/weddings/me/categories", response_model=WeddingCategoriesOut)
async def list_wedding_categories() -> WeddingCategoriesOut:
    """목 응답(Phase 1) — #6은 실제 DB라 온보딩 직후엔 이 목 응답과 값이 다를 수 있다."""
    return WeddingCategoriesOut(
        categories=[
            WeddingCategoryOut(
                category_id=id_,
                category_code=code,
                name_ko=name_ko,
                tier=tier,
                is_active=True,
                planned_budget=0,
                paid_amount=0,
                remaining=0,
                display_order=order,
                has_benchmark=has_benchmark,
                has_vendor_cases=has_vendor_cases,
            )
            for id_, code, name_ko, order, tier, _has_cost, has_benchmark, has_vendor_cases in MOCK_CATEGORIES
        ]
    )


@router.put("/weddings/me/categories", response_model=WeddingCategoriesOut)
async def update_wedding_categories(
    payload: WeddingCategoriesUpdate,
    wedding: Wedding = Depends(get_the_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> WeddingCategoriesOut:
    categories = await update_wedding_categories_service(session, wedding, payload)
    return WeddingCategoriesOut(categories=categories)
