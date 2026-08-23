"""#16 GET /vendor-cases [신규 F10] — 03_API_spec.md §3. 예식장·스드메 전용 업체 사례 카드."""

from pydantic import BaseModel

from app.schemas.common import BenchmarkCategoryCode, CaseType, ItemType, SourceTier


class VendorCaseOut(BaseModel):
    id: int
    case_type: CaseType
    case_label: str
    situation: str
    key_lesson: str
    related_item_type: ItemType | None
    source_tier: SourceTier


class VendorCaseListOut(BaseModel):
    category_code: BenchmarkCategoryCode
    disclaimer: str
    cases: list[VendorCaseOut]
