"""#7 GET /categories — 03_API_spec.md §3. 7개 카테고리 마스터 목록.

목 응답이지만 실제 시드 마이그레이션(7e1bfc107dc7_seed_categories.py)과 동일한 값이라 Phase 2에서
DB 조회로 바꿔도 프론트가 보는 값은 달라지지 않는다."""

from fastapi import APIRouter

from app.routers._mock import MOCK_CATEGORIES
from app.schemas.category import CategoryListOut, CategoryOut

router = APIRouter(tags=["category"])


@router.get("/categories", response_model=CategoryListOut)
async def list_categories() -> CategoryListOut:
    return CategoryListOut(
        categories=[
            CategoryOut(
                id=id_,
                code=code,
                name_ko=name_ko,
                display_order=order,
                tier=tier,
                has_cost=has_cost,
                has_benchmark=has_benchmark,
                has_vendor_cases=has_vendor_cases,
            )
            for id_, code, name_ko, order, tier, has_cost, has_benchmark, has_vendor_cases in MOCK_CATEGORIES
        ]
    )
