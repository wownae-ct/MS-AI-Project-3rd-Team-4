"""#16 GET /vendor-cases [신규 F10] — 03_API_spec.md §3. 예식장·스드메 전용 업체 사례 카드.

목 응답(Phase 1)이지만 has_vendor_cases 플래그 조회로 MOCKUP 카테고리에 404를 내려주는 실제
분기는 포함한다(#15와 동일 원칙)."""

from fastapi import APIRouter

from app.core.errors import api_error
from app.routers._mock import MOCK_CATEGORIES
from app.schemas.vendor_case import VendorCaseListOut, VendorCaseOut

router = APIRouter(tags=["vendor-case"])

_HAS_VENDOR_CASES_BY_CODE = {row[1]: row[7] for row in MOCK_CATEGORIES}

_MOCK_CASES = [
    VendorCaseOut(
        id=5,
        case_type="BAD",
        case_label="B 스튜디오 사례",
        situation=(
            "촬영 계약 시 앨범 비용이 포함된 줄 알았으나, 촬영 후 앨범 업그레이드를 강하게 "
            "권유받았고 기본형은 사실상 선택이 어려운 구성이었다."
        ),
        key_lesson="계약서에 '기본 제공 앨범'의 페이지 수·재질이 명시돼 있는지, 업그레이드가 사실상 강제되는 구조는 아닌지 계약 전에 확인하세요.",
        related_item_type="CONTRACT_TERM",
        source_tier="CONSENSUS",
    ),
    VendorCaseOut(
        id=1,
        case_type="GOOD",
        case_label="A 예식장 사례",
        situation="견적 상담 시 대관료 외 필수 추가금(주차, 조명, 리허설) 목록을 서면으로 먼저 제시했고, 계약서에도 동일하게 명시돼 있었다.",
        key_lesson="견적서 단계에서부터 필수 추가금 목록을 서면으로 요구하고, 계약서 문구가 견적서와 일치하는지 대조하세요.",
        related_item_type="EXTRA_COST",
        source_tier="OFFICIAL",
    ),
]


@router.get("/vendor-cases", response_model=VendorCaseListOut)
async def list_vendor_cases(category_code: str, case_type: str | None = None) -> VendorCaseListOut:
    if not _HAS_VENDOR_CASES_BY_CODE.get(category_code, False):
        raise api_error(
            404, "VENDOR_CASE_NOT_AVAILABLE", f"{category_code}는 업체 사례를 제공하지 않습니다."
        )
    cases = _MOCK_CASES
    if case_type is not None:
        cases = [c for c in cases if c.case_type == case_type]
    return VendorCaseListOut(
        category_code=category_code,
        disclaimer="아래 사례는 여러 실제 사례를 재구성한 예시이며 특정 업체를 지칭하지 않습니다.",
        cases=cases,
    )
