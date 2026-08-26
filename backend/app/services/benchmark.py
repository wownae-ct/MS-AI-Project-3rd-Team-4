"""참가격(price_benchmarks) 조회 로직. 04_ERD.md/RQ-F1-03/RQ-F8-01(03_API_spec.md #23).

의도적으로 region_code를 문자열 인자로 받지 Wedding ORM 객체를 받지 않는다 — 이 서비스가 만들어진
시점엔 아직 weddings 테이블도 auth(get_current_wedding)도 없다(9acc4aa37be1로 price_benchmarks만
먼저 재구현). 나중에 auth 스텝에서 라우터가 `get_current_wedding()`으로 얻은 wedding.region_code를
그대로 넘겨 호출하기만 하면 되도록, 이 모듈 자체는 auth/weddings에 대한 의존성이 전혀 없다."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PriceBenchmark
from app.schemas.benchmark import PercentileLabel
from app.schemas.common import RegionCode

# 수도권 = 서울/인천/경기(통계청 관용 정의). price_benchmarks 원본(참가격 xlsx)이 이미 이 3개
# 지역을 '수도권' 집계 행으로 함께 발행하므로, 특정 세분 지역에 데이터가 없을 때 이 버킷으로
# 먼저 폴백한 뒤 그래도 없으면 전국(NATIONWIDE)으로 넘어간다.
_METRO_REGIONS: frozenset[str] = frozenset({"SEOUL_GANGNAM", "SEOUL_OTHER", "INCHEON", "GYEONGGI"})
_AGGREGATE_REGIONS: frozenset[str] = frozenset({"NATIONWIDE", "METRO", "NON_METRO"})


def resolve_region_fallback_chain(region_code: RegionCode) -> list[RegionCode]:
    """특정 지역 → 수도권/비수도권 → 전국 순으로, 데이터가 있을 때까지 시도할 region_code
    목록을 우선순위대로 반환한다. 이미 집계 지역(NATIONWIDE/METRO/NON_METRO)이면 그 지역과
    전국만 남긴다."""
    if region_code == "NATIONWIDE":
        return ["NATIONWIDE"]
    if region_code in _AGGREGATE_REGIONS:
        return [region_code, "NATIONWIDE"]
    bucket: RegionCode = "METRO" if region_code in _METRO_REGIONS else "NON_METRO"
    return [region_code, bucket, "NATIONWIDE"]


def compute_ratio_and_label(amount: int, median_price: int) -> tuple[float, PercentileLabel]:
    """03_API_spec.md #23: "0.9 미만 낮음 / 0.9~1.1 평균 / 1.1 초과 높음" 3단 라벨.

    트러블슈팅 STEP 11(2026-08-26): 임계값 비교를 반올림 *후* 값으로 하면 경계에서 오분류된다
    (예: ratio=1.101은 "높음"이어야 하는데 반올림하면 1.10이 되어 "평균"으로 잘못 분류됨).
    반올림은 표시용 반환값에만 적용하고, 라벨 판정은 원본(반올림 전) 값으로 한다."""
    raw_ratio = amount / median_price
    label: PercentileLabel = "낮음" if raw_ratio < 0.9 else "높음" if raw_ratio > 1.1 else "평균"
    return round(raw_ratio, 2), label


async def get_latest_benchmark(
    session: AsyncSession,
    region_code: RegionCode,
    category_code: str,
    item_code: str,
) -> PriceBenchmark | None:
    """지역 폴백 체인을 순서대로 시도해 첫 매치를 반환한다. 같은 region_code에 여러
    survey_month가 있으면 최신 달을 고른다."""
    for candidate_region in resolve_region_fallback_chain(region_code):
        stmt = (
            select(PriceBenchmark)
            .where(
                PriceBenchmark.region_code == candidate_region,
                PriceBenchmark.category_code == category_code,
                PriceBenchmark.item_code == item_code,
            )
            .order_by(PriceBenchmark.survey_month.desc())
            .limit(1)
        )
        row = (await session.execute(stmt)).scalar_one_or_none()
        if row is not None:
            return row
    return None
