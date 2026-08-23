"""app/services/benchmark.py의 순수 함수 테스트(DB 세션이 필요한 get_latest_benchmark는
라이브 DB가 있는 사용자 환경에서 확인 — 여기선 지역 폴백/비율 계산만 다룬다)."""

from app.services.benchmark import compute_ratio_and_label, resolve_region_fallback_chain


class TestResolveRegionFallbackChain:
    def test_metro_region_falls_back_through_metro_bucket(self):
        assert resolve_region_fallback_chain("SEOUL_GANGNAM") == [
            "SEOUL_GANGNAM",
            "METRO",
            "NATIONWIDE",
        ]

    def test_non_metro_region_falls_back_through_non_metro_bucket(self):
        assert resolve_region_fallback_chain("JEJU") == ["JEJU", "NON_METRO", "NATIONWIDE"]

    def test_gyeonggi_incheon_are_metro(self):
        assert resolve_region_fallback_chain("GYEONGGI")[1] == "METRO"
        assert resolve_region_fallback_chain("INCHEON")[1] == "METRO"

    def test_aggregate_region_only_falls_back_to_nationwide(self):
        assert resolve_region_fallback_chain("METRO") == ["METRO", "NATIONWIDE"]

    def test_nationwide_is_terminal(self):
        assert resolve_region_fallback_chain("NATIONWIDE") == ["NATIONWIDE"]


class TestComputeRatioAndLabel:
    def test_below_point_nine_is_low(self):
        ratio, label = compute_ratio_and_label(amount=1_000_000, median_price=2_000_000)
        assert ratio == 0.5
        assert label == "낮음"

    def test_above_one_point_one_is_high(self):
        ratio, label = compute_ratio_and_label(amount=3_000_000, median_price=2_000_000)
        assert ratio == 1.5
        assert label == "높음"

    def test_within_band_is_average(self):
        ratio, label = compute_ratio_and_label(amount=2_000_000, median_price=2_000_000)
        assert ratio == 1.0
        assert label == "평균"

    def test_boundary_point_nine_is_average_not_low(self):
        ratio, label = compute_ratio_and_label(amount=900_000, median_price=1_000_000)
        assert ratio == 0.9
        assert label == "평균"

    def test_boundary_one_point_one_is_average_not_high(self):
        ratio, label = compute_ratio_and_label(amount=1_100_000, median_price=1_000_000)
        assert ratio == 1.1
        assert label == "평균"
