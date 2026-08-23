"""#7 GET /categories — 03_API_spec.md §3. 9개 카테고리 마스터 목록.

DB 테이블이 아니라 백엔드 상수(app/core/categories.py)를 그대로 응답하므로 categories.id 같은
숫자 PK가 없다 — 03_API_spec.md #11 예시 JSON에도 id 필드가 없다."""

from pydantic import BaseModel

from app.schemas.common import CategoryCode, CategoryTier


class CategoryOut(BaseModel):
    code: CategoryCode
    name_ko: str
    display_order: int
    tier: CategoryTier
    has_cost: bool
    has_benchmark: bool
    has_vendor_cases: bool
    allows_custom_tag: bool


class CategoryListOut(BaseModel):
    categories: list[CategoryOut]
