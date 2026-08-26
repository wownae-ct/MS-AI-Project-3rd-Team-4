"""#7 GET /categories — 03_API_spec.md §3. 9개 카테고리 마스터 목록.

v4.0은 categories 테이블 대신 category_code ENUM + 백엔드 상수를 쓴다(03_API_spec.md #11:
"DB 테이블이 아니라 백엔드 코드 상수 그대로 응답한다") — app/core/categories.py의 CATEGORY_META가
그 단일 소스이며, wedding_categories 9행 생성 등 다른 곳에서도 이미 같은 상수를 쓴다."""

from fastapi import APIRouter

from app.core.categories import CATEGORY_META
from app.schemas.category import CategoryListOut, CategoryOut

router = APIRouter(tags=["category"])


@router.get("/categories", response_model=CategoryListOut)
async def list_categories() -> CategoryListOut:
    return CategoryListOut(
        categories=[
            CategoryOut(
                code=meta.code,
                name_ko=meta.name_ko,
                display_order=meta.display_order,
                tier=meta.tier,
                has_cost=meta.has_cost,
                has_benchmark=meta.has_benchmark,
                has_vendor_cases=meta.has_vendor_cases,
                allows_custom_tag=meta.allows_custom_tag,
            )
            for meta in CATEGORY_META
        ]
    )
