"""#7 GET /categories — 03_API_spec.md §3. 7개 카테고리 마스터 목록."""

from pydantic import BaseModel

from app.schemas.common import CategoryCode, CategoryTier


class CategoryOut(BaseModel):
    id: int
    code: CategoryCode
    name_ko: str
    display_order: int
    tier: CategoryTier
    has_cost: bool
    has_benchmark: bool
    has_vendor_cases: bool


class CategoryListOut(BaseModel):
    categories: list[CategoryOut]
