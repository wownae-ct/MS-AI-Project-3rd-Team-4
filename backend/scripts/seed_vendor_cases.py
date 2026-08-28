"""[F10] docs/wedding/ing/f10-seed-data-prep.md 4건 → vendor_case_examples UPSERT.

RAG 코퍼스가 아니다(app/rag/indexing.py의 대상이 아님) — F10 카드는 채팅 근거검색과 무관하게
GET /vendor-cases(03_API_spec.md #24)가 직접 이 테이블에서 읽는다. 사람이
`uv run python scripts/seed_vendor_cases.py`로 직접 실행한다(원본 콘텐츠가 정적 4건이라
자동 재실행할 이유가 없다 — price_benchmarks처럼 주기적으로 갱신되는 원본이 아니다).

4건 모두 docs/wedding/plan/new/06_RAG_implementation_and_copyright_review.md §3 명예훼손 리스크
체크리스트(실명 금지 / 2개 이상 사례 합성 / 행동지침형 key_lesson / BAD는 공식 출처 근거) 통과
확인 완료(docs/wedding/ing/f10-seed-data-prep.md 출처 절 참고) — 검증되지 않은 새 사례를
여기에 직접 추가하지 않는다. 문구를 고칠 때는 그 문서도 함께 갱신할 것.

멱등성: id를 고정 부여(1~4, f10-seed-data-prep.md의 display_order와 동일 순서)하고
ON CONFLICT (id) UPDATE로 UPSERT한다 — 재실행해도 안전하다."""

import asyncio
from dataclasses import asdict, dataclass

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session_factory
from app.models import VendorCaseExample


@dataclass(frozen=True)
class VendorCaseRow:
    id: int
    category_code: str
    case_type: str
    case_label: str
    situation: str
    key_lesson: str
    related_item_type: str | None
    source_tier: str
    source_note: str
    display_order: int


VENDOR_CASE_ROWS: list[VendorCaseRow] = [
    VendorCaseRow(
        id=1,
        category_code="VENUE",
        case_type="GOOD",
        case_label="한 예식장 투어 사례",
        situation=(
            "복수 웨딩홀을 투어하며 드레스·메이크업샵 인접 여부, 부모님 식사 공간, "
            "촬영 시간 배분 등 부대시설·동선을 미리 확인하고, 계약금과 잔금(예식 당일 "
            "결제)을 처음부터 구분해 기록해둔 경우."
        ),
        key_lesson=(
            "계약 전 부대시설 위치·시간 배분을 확인하고, 계약금과 잔금의 지급 시점을 "
            "서면으로 명확히 구분해두라."
        ),
        related_item_type="CONTRACT_TERM",
        source_tier="CONSENSUS",
        source_note="DS8_UGC 사례 재구성(#1+#3+#5)",
        display_order=1,
    ),
    VendorCaseRow(
        id=2,
        category_code="VENUE",
        case_type="BAD",
        case_label="한 예식장 계약 사례",
        situation=(
            "견적·혜택 조건은 만족스러웠지만 희망 예식 시간대를 사전에 확인하지 않아 계약이 "
            "무산된 경우. 조건 확인 소홀로 인한 계약 관련 분쟁(해지·위약금·청약철회)은 "
            "결혼서비스 피해예방주의보 통계상 전체 분쟁의 88.1%를 차지할 만큼 흔한 유형이다."
        ),
        key_lesson=(
            "예식 희망 시간대·세부조건을 계약 전에 서면으로 먼저 확인하고, 계약 해제·변경 "
            "시 위약금 기준(소비자분쟁해결기준)을 미리 숙지하라."
        ),
        related_item_type="CONTRACT_TERM",
        source_tier="CONSENSUS",
        source_note="DS8_UGC+DS2_KCA 사례 재구성(#2, 2026-04-22 피해예방주의보 통계)",
        display_order=2,
    ),
    VendorCaseRow(
        id=3,
        category_code="SDM",
        case_type="GOOD",
        case_label="한 스드메 투어 사례",
        situation=(
            "드레스투어 전 샵별 피팅비(1~5만원)와 드레스 벌 수 제한을 비교하고, 예약 경로"
            "(플랫폼 경유 시 투어비 환급/지정가봉 시 투어비 면제)에 따른 혜택 차이를 확인, "
            "계약 관련 고민사항을 직원과 사전 조율한 경우."
        ),
        key_lesson=(
            "드레스투어 전 피팅비·벌 수 제한을 샵별로 비교하고, 예약 경로별 혜택 차이와 "
            "계약 조건을 직원에게 직접 확인하라."
        ),
        related_item_type="CONTRACT_TERM",
        source_tier="CONSENSUS",
        source_note="DS8_UGC 사례 재구성(#6+#7+#9)",
        display_order=3,
    ),
    VendorCaseRow(
        id=4,
        category_code="SDM",
        case_type="BAD",
        case_label="한 스드메 계약 사례",
        situation=(
            "기본 드레스 가격대를 사전 확인하지 않아 예산 계획이 흔들린 경우. "
            "결혼준비대행업 표준계약서상 스튜디오·드레스·헤어메이크업은 촬영일에 임박할수록 "
            "취소 위약금이 단계적으로 급증하는 구조라, 가격·조건 미확인 상태의 계약은 "
            "이후 취소 시 부담이 커진다."
        ),
        key_lesson=(
            "스드메 기본 가격대와 취소 시 위약금 단계(임박할수록 급증)를 계약 전에 반드시 확인하라."
        ),
        related_item_type="CONTRACT_TERM",
        source_tier="CONSENSUS",
        source_note="DS8_UGC+DS3_FTC 사례 재구성(#8, 결혼준비대행업 표준계약서 붙임2 위약금 예시)",
        display_order=4,
    ),
]


def collect_rows() -> list[VendorCaseRow]:
    """DB I/O 없는 순수 함수 — 정적 데이터를 그대로 반환한다."""
    return VENDOR_CASE_ROWS


async def _upsert_rows(session: AsyncSession, rows: list[VendorCaseRow]) -> int:
    if not rows:
        return 0
    stmt = pg_insert(VendorCaseExample).values([asdict(row) for row in rows])
    stmt = stmt.on_conflict_do_update(
        index_elements=["id"],
        set_={
            "category_code": stmt.excluded.category_code,
            "case_type": stmt.excluded.case_type,
            "case_label": stmt.excluded.case_label,
            "situation": stmt.excluded.situation,
            "key_lesson": stmt.excluded.key_lesson,
            "related_item_type": stmt.excluded.related_item_type,
            "source_tier": stmt.excluded.source_tier,
            "source_note": stmt.excluded.source_note,
            "display_order": stmt.excluded.display_order,
        },
    )
    await session.execute(stmt)
    await session.commit()
    return len(rows)


async def seed() -> None:
    rows = collect_rows()
    async with get_session_factory()() as session:
        count = await _upsert_rows(session, rows)
    print(f"upserted {count} vendor_case_examples rows")


if __name__ == "__main__":
    asyncio.run(seed())
