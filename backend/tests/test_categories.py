"""app/core/categories.py의 CATEGORY_META — GET /categories 및 다른 소비자들의 단일 소스라
드리프트가 나면 여러 곳이 동시에 깨진다(00_BASELINE.md §1, 03_API_spec.md #11)."""

from app.core.categories import CATEGORY_META
from app.models.wedding import CategoryCodeEnum
from app.schemas.common import CategoryCode


class TestCategoryMeta:
    def test_has_exactly_nine_categories(self):
        assert len(CATEGORY_META) == 9

    def test_display_order_is_zero_to_eight_in_order(self):
        assert [m.display_order for m in CATEGORY_META] == list(range(9))

    def test_codes_match_category_code_enum(self):
        meta_codes = {m.code for m in CATEGORY_META}
        enum_codes = set(CategoryCodeEnum.enums)
        assert meta_codes == enum_codes

    def test_codes_match_category_code_literal(self):
        meta_codes = {m.code for m in CATEGORY_META}
        literal_codes = set(CategoryCode.__args__)
        assert meta_codes == literal_codes

    def test_only_venue_and_sdm_are_focus_with_benchmark_and_vendor_cases(self):
        focus = {m.code for m in CATEGORY_META if m.tier == "FOCUS"}
        benchmark = {m.code for m in CATEGORY_META if m.has_benchmark}
        vendor_cases = {m.code for m in CATEGORY_META if m.has_vendor_cases}
        assert focus == benchmark == vendor_cases == {"VENUE", "SDM"}

    def test_every_category_has_cost(self):
        """2026-08-29 제품 확인 — 상견례(MEETING)도 비용 설정이 가능해야 한다.

        그 전까지 MEETING만 has_cost=False였고(00_BASELINE.md §1 표), 프론트는 그 값을 보고
        온보딩 배분 입력·예산 배정 행·결제 등록을 통째로 막았다. 이제 9개 전부 True다 —
        플래그 자체는 계약에 남아 있으므로 소비자들은 계속 이 값을 읽는다.
        """
        no_cost = {m.code for m in CATEGORY_META if not m.has_cost}
        assert no_cost == set()

    def test_only_etc_allows_custom_tag(self):
        allows_custom = {m.code for m in CATEGORY_META if m.allows_custom_tag}
        assert allows_custom == {"ETC"}
