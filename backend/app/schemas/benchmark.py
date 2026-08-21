"""#15 GET /benchmarks/compare — 03_API_spec.md §3. 예식장·스드메 전용 참가격 비교."""

from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import BenchmarkCategoryCode

# 03_API_spec.md #15: "0.9 미만 낮음 / 0.9~1.1 평균 / 1.1 초과 높음 — 3단 라벨로 과설계하지
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
