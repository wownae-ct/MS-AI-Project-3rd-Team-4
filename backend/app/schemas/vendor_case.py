"""#16 GET /vendor-cases [신규 F10] — 03_API_spec.md §3. 예식장·스드메 전용 업체 사례 카드."""

from pydantic import BaseModel

from app.schemas.chat import CitationOut
from app.schemas.common import BenchmarkCategoryCode, CaseType, ItemType, SourceTier


class VendorCaseOut(BaseModel):
    id: int
    case_type: CaseType
    case_label: str
    situation: str
    key_lesson: str
    related_item_type: ItemType | None
    source_tier: SourceTier
    # 팀이 재구성한 이 사례와 관련된 실제 공식 분쟁조정 사례(DS2_KCA) — app/services/
    # vendor_case.py::related_ds2_cases()가 채운다. CitationOut(entities/chat과 같은 인용
    # 형태, chunk_id/title/source_tier/source_url)을 그대로 재사용한다 — 근거 표시 형태를
    # 새로 만들 이유가 없다(DRY). 관련 사례가 없으면 빈 리스트다(지어내지 않는다).
    related_cases: list[CitationOut]


class VendorCaseListOut(BaseModel):
    category_code: BenchmarkCategoryCode
    disclaimer: str
    cases: list[VendorCaseOut]
