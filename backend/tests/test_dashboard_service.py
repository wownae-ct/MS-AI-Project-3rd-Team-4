"""app/services/dashboard.py::build_budget_benchmark 순수 함수 테스트 — DB 세션이 필요한
get_latest_benchmark 자체는 라이브 DB가 있는 사용자 환경에서 확인(test_benchmark_service.py와
동일 컨벤션). 대시보드 요약(#25)의 budget_benchmark 필드가 지역 TOTAL/TOTAL 참가격과
total_budget을 올바르게 비교하는지, 참가격이 없는 지역이면 전체 대시보드를 막지 않고 null을
돌려주는지를 다룬다."""

from datetime import date

from app.models import PriceBenchmark
from app.services.dashboard import build_budget_benchmark


def _benchmark(median_price: int) -> PriceBenchmark:
    return PriceBenchmark(
        survey_month=date(2026, 1, 1),
        region_code="SEOUL_GANGNAM",
        category_code="TOTAL",
        item_code="TOTAL",
        median_price=median_price,
        min_price=None,
        max_price=None,
        sample_count=None,
        source_url="https://example.com/price-survey",
    )


class TestBuildBudgetBenchmark:
    def test_no_benchmark_returns_none(self):
        # 해당 지역에 TOTAL/TOTAL 참가격 시드가 아직 없는 경우 — 대시보드 전체를 404로 막지
        # 않고 이 필드만 null이어야 한다.
        assert build_budget_benchmark(30_000_000, None) is None

    def test_budget_below_median_is_labeled_low(self):
        result = build_budget_benchmark(15_000_000, _benchmark(30_000_000))
        assert result.ratio_to_median == 0.5
        assert result.percentile_label == "낮음"

    def test_budget_above_median_is_labeled_high(self):
        result = build_budget_benchmark(45_000_000, _benchmark(30_000_000))
        assert result.ratio_to_median == 1.5
        assert result.percentile_label == "높음"

    def test_fields_pass_through_from_benchmark_row(self):
        result = build_budget_benchmark(30_000_000, _benchmark(30_000_000))
        assert result.region_code == "SEOUL_GANGNAM"
        assert result.median_price == 30_000_000
        assert result.source_url == "https://example.com/price-survey"
        assert result.percentile_label == "평균"
