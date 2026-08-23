"""app/core/timeline_catalog.py 정적 데이터 회귀 테스트 — docs/wedding/ing/
ds7-timeline-seed-data-prep.md 완성본(55항목)과 계속 일치하는지 확인한다."""

from app.core.timeline_catalog import TIMELINE_CATALOG
from app.schemas.common import CategoryCode

_VALID_CATEGORY_CODES: set[CategoryCode] = {
    "MEETING",
    "VENUE",
    "SDM",
    "GIFT",
    "HOMEWARE",
    "INVITATION",
    "HONEYMOON",
    "HOMENEW",
    "ETC",
}


class TestTimelineCatalog:
    def test_has_exactly_55_items(self):
        assert len(TIMELINE_CATALOG) == 55

    def test_display_order_is_1_to_55_unique_and_sequential(self):
        orders = [item.display_order for item in TIMELINE_CATALOG]
        assert orders == list(range(1, 56))

    def test_category_codes_are_none_or_valid(self):
        for item in TIMELINE_CATALOG:
            assert item.category_code is None or item.category_code in _VALID_CATEGORY_CODES

    def test_offsets_are_within_documented_range(self):
        # docs/wedding/ing/ds7-timeline-seed-data-prep.md: 음수 44개(본식 전), 0(당일) 3개,
        # 양수(본식 후) 3개 — 감사인사 작성이 가장 늦은 D+14.
        for item in TIMELINE_CATALOG:
            assert -365 <= item.dday_offset_days <= 14

    def test_offset_sign_distribution_sums_to_55(self):
        # 원본 문서(ds7-timeline-seed-data-prep.md)는 "음수 44개"라고 적었지만 44+3(당일)+3(이후)
        # =50으로 55와 안 맞는 자체 산술 오류다 — 실제로 옮겨 적은 55항목 기준 정확한 값(49/3/3,
        # 합 55)으로 검증한다.
        negative = sum(1 for item in TIMELINE_CATALOG if item.dday_offset_days < 0)
        zero = sum(1 for item in TIMELINE_CATALOG if item.dday_offset_days == 0)
        positive = sum(1 for item in TIMELINE_CATALOG if item.dday_offset_days > 0)
        assert (negative, zero, positive) == (49, 3, 3)

    def test_all_titles_non_empty(self):
        assert all(item.title.strip() for item in TIMELINE_CATALOG)
