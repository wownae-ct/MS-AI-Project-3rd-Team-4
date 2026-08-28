"""#23 GET /benchmarks/compare, #31 GET /benchmarks/total-average — 03_API_spec.md §3.
예식장·스드메 참가격 비교 + 온보딩 예산 "미정" 슬라이더 지역평균 플레이스홀더(00_BASELINE.md
§2-5)."""

from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import BenchmarkCategoryCode

# 03_API_spec.md #23: "0.9 미만 낮음 / 0.9~1.1 평균 / 1.1 초과 높음 — 3단 라벨로 과설계하지
# 않는다"는 규칙이 명시 문구이고, 예시 JSON의 "평균 대비 약간 높음"은 설명용 표현이라 실제
# enum 값은 이 3단을 따른다(2026-08-21 판단).
PercentileLabel = Literal["낮음", "평균", "높음"]


class BenchmarkCompareOut(BaseModel):
    category_code: BenchmarkCategoryCode
    item_code: str
    region_code: str
    survey_month: date
    your_amount: int
    median_price: int
    min_price: int | None
    max_price: int | None
    sample_count: int | None
    percentile_label: PercentileLabel
    ratio_to_median: float
    source_url: str


class TotalBudgetPlaceholderOut(BaseModel):
    """비교 대상 금액(your_amount)도 카테고리도 없다 — 온보딩 중 아직 웨딩이 생성되기 전에
    지역만으로 슬라이더 플레이스홀더 값을 미리 보여주기 위한 것뿐이라 BenchmarkCompareOut의
    percentile_label/ratio_to_median처럼 "내 금액과 비교"하는 필드는 애초에 없다."""

    region_code: str
    survey_month: date
    median_price: int
    min_price: int | None
    max_price: int | None
    sample_count: int | None
    source_url: str
