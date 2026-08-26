"""#24 GET /vendor-cases [신규 F10] — 03_API_spec.md §3. 예식장·스드메 전용 업체 사례 카드.

실DB 조회(app/services/vendor_case.py)로 동작한다 — F10은 카테고리 재구현/auth 재구현과
무관하게 완결 가능(FK 없음, wedding_id 불필요)해서 다른 세션의 auth/카테고리 ENUM 작업과
독립적으로 여기서 먼저 실동작으로 전환했다.

카드 내용은 임의 작성이 아니라 docs/wedding/plan/new/06_RAG_implementation_and_copyright_review.md
§3 명예훼손 리스크 체크리스트(실명 금지 / 2개 이상 사례 합성 / 행동지침형 key_lesson / BAD는
공식 출처 근거)를 통과한 docs/wedding/ing/f10-seed-data-prep.md 초안 4건 그대로다 — DB에는
`uv run python scripts/seed_vendor_cases.py`로 적재한다. 각 case의 합성 출처는 그 문서에
source_note로 기록돼 있으니, 문구를 고칠 때는 그쪽 문서도 함께 갱신할 것 — 검증을 거치지 않은
새 사례를 seed 스크립트에 직접 추가하지 않는다."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import api_error
from app.schemas.vendor_case import VendorCaseListOut, VendorCaseOut
from app.services.vendor_case import DISCLAIMER, FOCUS_CATEGORIES, related_ds2_cases
from app.services.vendor_case import list_vendor_cases as list_vendor_cases_service

router = APIRouter(tags=["vendor-case"])


@router.get("/vendor-cases", response_model=VendorCaseListOut)
async def list_vendor_cases(
    category_code: str,
    case_type: str | None = None,
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> VendorCaseListOut:
    if category_code not in FOCUS_CATEGORIES:
        raise api_error(
            404, "VENDOR_CASE_NOT_AVAILABLE", f"{category_code}는 업체 사례를 제공하지 않습니다."
        )
    rows = await list_vendor_cases_service(session, category_code, case_type)
    # 카드마다 DS2_KCA 관련 사례를 개별 조회한다 — 카드가 최대 몇 장뿐(F10, 카테고리당 소수)
    # 이라 N+1이 문제가 될 규모가 아니고, 각 카드의 situation/key_lesson으로 각각 다르게
    # 검색해야 해서 한 번에 묶어 조회할 방법도 없다.
    cases = [
        VendorCaseOut(
            id=row.id,
            case_type=row.case_type,
            case_label=row.case_label,
            situation=row.situation,
            key_lesson=row.key_lesson,
            related_item_type=row.related_item_type,
            source_tier=row.source_tier,
            related_cases=await related_ds2_cases(
                session, category_code, row.situation, row.key_lesson
            ),
        )
        for row in rows
    ]
    return VendorCaseListOut(
        category_code=category_code,
        disclaimer=DISCLAIMER,
        cases=cases,
    )
