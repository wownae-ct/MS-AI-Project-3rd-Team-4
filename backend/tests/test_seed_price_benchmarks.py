"""scripts/seed_price_benchmarks.py의 순수 파싱 로직 테스트. 실제 원본 xlsx가 아니라 같은
레이아웃(1행 제목, 2행 단위, 3-4행 헤더, 5행부터 데이터)의 합성 워크북을 openpyxl로 직접
만들어 검증한다 — 실 데이터 파일의 값이 바뀌어도 테스트가 깨지지 않게, DB/네트워크 없이 도는
순수 함수만 대상으로 한다."""

from datetime import date

from openpyxl import Workbook

from scripts.seed_price_benchmarks import (
    _build_distribution_rows,
    _build_total_rows,
    _iter_region_rows,
    _parse_number,
    _parse_unit_multiplier,
)


def _distribution_sheet(unit_text: str, rows: list[tuple]) -> Workbook:
    """실 데이터와 같은 레이아웃(A~J열)의 시트를 만든다. rows는 5행부터 순서대로 들어간다."""
    wb = Workbook()
    ws = wb.active
    ws.append(["[ 제목 ]"])
    ws.append([unit_text])
    ws.append(["구분", None, "가격 분포"])
    ws.append(
        [
            None,
            None,
            "하위 10%",
            "하위 25%",
            "중간가격",
            "상위 25%",
            "상위 10%",
            "평균",
            "건수",
            "비율",
        ]
    )
    for row in rows:
        ws.append(list(row))
    return wb


class TestParseUnitMultiplier:
    def test_returns_10000_when_unit_text_contains_manwon(self):
        assert _parse_unit_multiplier("(단위 : 만 원, 건, %)") == 10_000

    def test_returns_10000_when_no_space_between_man_and_won(self):
        assert _parse_unit_multiplier("(단위 : 만원, 건, %)") == 10_000

    def test_returns_1_when_unit_is_plain_won(self):
        assert _parse_unit_multiplier("(단위 : 원, 건, %)") == 1

    def test_returns_1_when_value_is_not_a_string(self):
        assert _parse_unit_multiplier(None) == 1


class TestParseNumber:
    def test_parses_int_cell(self):
        assert _parse_number(1580) == 1580

    def test_parses_float_cell_by_rounding(self):
        assert _parse_number(57.480636) == 57

    def test_returns_none_for_dash_placeholder(self):
        assert _parse_number("-") is None

    def test_returns_none_for_empty_cell(self):
        assert _parse_number(None) is None


class TestIterRegionRows:
    def test_stops_at_footnote_row_after_known_regions(self):
        wb = _distribution_sheet(
            "(단위 : 만 원, 건, %)",
            [
                ("전국", None, 200, 240, 290, 350, 412, 311, 1798, 100),
                (None, "수도권", 200, 225, 286, 365, 607, 336, 630, 35),
                ("서울(강남)", None, 200, 242, 295, 400, 617, 361, 503, 28),
                ("* 이번 조사에서 제주도는 스드메 계약 건이 없었음.",),
            ],
        )
        pairs = list(_iter_region_rows(wb.active))
        codes = [code for code, _ in pairs]
        assert codes == ["NATIONWIDE", "METRO", "SEOUL_GANGNAM"]

    def test_missing_region_is_simply_absent_not_zero_filled(self):
        # 스드메 시트처럼 제주도 행 자체가 없는 경우 — 목록에 JEJU가 안 들어가야 한다.
        wb = _distribution_sheet(
            "(단위 : 만 원, 건, %)",
            [("강원도", None, 220, 230, 250, 280, 342, 260, 56, 2.9)],
        )
        codes = [code for code, _ in _iter_region_rows(wb.active)]
        assert "JEJU" not in codes
        assert codes == ["GANGWON"]


class TestBuildDistributionRows:
    def test_converts_manwon_to_won_and_maps_percentiles_to_min_max(self):
        wb = _distribution_sheet(
            "(단위 : 만 원, 건, %)",
            [("전국", None, 740, 1090, 1580, 2240, 3247, 1842, 4906, 100)],
        )
        rows = _build_distribution_rows(wb.active, "VENUE", "RENTAL_FEE", date(2025, 8, 1))
        assert len(rows) == 1
        row = rows[0]
        assert row.region_code == "NATIONWIDE"
        assert row.category_code == "VENUE"
        assert row.item_code == "RENTAL_FEE"
        assert row.median_price == 15_800_000  # 1580만원 -> 원
        assert row.min_price == 7_400_000  # 하위10% 740만원 근사 최저
        assert row.max_price == 32_470_000  # 상위10% 3247만원 근사 최고
        assert row.sample_count == 4906
        assert "2025-08" in row.source_note

    def test_does_not_scale_won_unit_sheets(self):
        wb = _distribution_sheet(
            "(단위 : 원, 건, %)",
            [("전국", None, 44000, 50000, 60000, 75000, 90000, 66474, 4906, 100)],
        )
        rows = _build_distribution_rows(wb.active, "VENUE", "MEAL_PER_PERSON", date(2025, 8, 1))
        assert rows[0].median_price == 60000

    def test_skips_row_when_median_cell_is_dash(self):
        wb = _distribution_sheet(
            "(단위 : 만 원, 건, %)",
            [("제주도", None, "-", "-", "-", "-", "-", "-", 0, 0)],
        )
        rows = _build_distribution_rows(wb.active, "SDM", "STUDIO", date(2025, 8, 1))
        assert rows == []

    def test_keeps_row_when_only_a_tail_percentile_is_dash(self):
        wb = _distribution_sheet(
            "(단위 : 만 원, 건, %)",
            [("대전", None, 125, 125, 140, 143, "-", 137, 6, 0.7)],
        )
        rows = _build_distribution_rows(wb.active, "SDM", "STUDIO", date(2025, 8, 1))
        assert len(rows) == 1
        assert rows[0].median_price == 1_400_000
        assert rows[0].max_price is None


class TestBuildTotalRows:
    def test_uses_total_contract_amount_column_and_marks_mean_not_median(self):
        wb = Workbook()
        ws = wb.active
        ws.append(["[ 지역별 결혼서비스 평균 계약금액 현황 ]"])  # 1행
        ws.append(["(단위 : 만 원, 건, %)"])  # 2행
        ws.append(
            ["구분", None, "결혼식장", None, None, None, None, None, "스드메", None, "총 계약금액*"]
        )  # 3행
        ws.append([None, None, "대관료", None, "장식비", None, "식대"])  # 4행
        ws.append(
            [
                "금액",
                "비율",
                "금액",
                "비율",
                "금액",
                "비율",
                "금액",
                "비율",
                "금액",
                "비율",
                "금액",
                "비율",
                "건수",
                "비율",
            ]
        )  # 5행 — 실 파일은 이 서브헤더 행이 하나 더 있어 데이터가 6행부터 시작한다
        ws.append(
            [
                "전국",
                None,
                410,
                18.98,
                100,
                4.62,
                1332,
                61.66,
                319,
                14.7,  # 결혼식장(대관료/장식비/식대)+스드메
                2160,
                100,  # 총계약금액 금액/비율  (index 10, 11)
                6820,
                100,  # 표본수 건수/비율      (index 12, 13)
            ]
        )
        rows = _build_total_rows(ws, date(2025, 8, 1))
        assert len(rows) == 1
        row = rows[0]
        assert row.category_code == "TOTAL"
        assert row.item_code == "TOTAL"
        assert row.region_code == "NATIONWIDE"
        assert row.median_price == 21_600_000
        assert row.min_price is None
        assert row.max_price is None
        assert row.sample_count == 6820
        assert "중간값 아님" in row.source_note
