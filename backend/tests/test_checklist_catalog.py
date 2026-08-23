"""app/core/checklist_catalog.py 정적 데이터 회귀 테스트.

VENUE/SDM 24항목(OFFICIAL)은 docs/wedding/ing/ds6-checklist-seed-data-prep.md와, 나머지 7개
MOCKUP 카테고리 35항목(CONSENSUS)은 00_BASELINE.md §0-2 Should "MOCKUP 7개 카테고리 얇은 시드"와
계속 일치하는지 확인한다(13_personalization_router_agent_design.md §2)."""

from typing import get_args

from app.core.checklist_catalog import CHECKLIST_FALLBACK_CATALOG, GROUP_LABEL_BY_ITEM_TYPE
from app.schemas.common import CategoryCode

ALL_CATEGORY_CODES = frozenset(get_args(CategoryCode))
MOCKUP_5_ITEM_CATEGORIES = frozenset(
    {"MEETING", "GIFT", "HOMEWARE", "INVITATION", "HONEYMOON", "HOMENEW", "ETC"}
)


class TestChecklistFallbackCatalog:
    def test_has_exactly_59_items(self):
        assert len(CHECKLIST_FALLBACK_CATALOG) == 24 + 7 * 5

    def test_venue_10_sdm_14_and_each_mockup_category_has_5(self):
        by_category: dict[str, int] = {}
        for item in CHECKLIST_FALLBACK_CATALOG:
            by_category[item.category_code] = by_category.get(item.category_code, 0) + 1
        assert by_category["VENUE"] == 10
        assert by_category["SDM"] == 14
        for code in MOCKUP_5_ITEM_CATEGORIES:
            assert by_category[code] == 5

    def test_all_9_categories_covered(self):
        assert {i.category_code for i in CHECKLIST_FALLBACK_CATALOG} == ALL_CATEGORY_CODES

    def test_venue_and_sdm_are_contract_term_and_official(self):
        official = [i for i in CHECKLIST_FALLBACK_CATALOG if i.category_code in ("VENUE", "SDM")]
        assert all(i.item_type == "CONTRACT_TERM" for i in official)
        assert all(i.source_tier == "OFFICIAL" for i in official)

    def test_mockup_categories_are_consensus(self):
        mockup = [
            i for i in CHECKLIST_FALLBACK_CATALOG if i.category_code in MOCKUP_5_ITEM_CATEGORIES
        ]
        assert all(i.source_tier == "CONSENSUS" for i in mockup)
        assert all(i.source_url is None for i in mockup)
        assert all(i.item_type in ("CONTRACT_TERM", "EXTRA_COST", "PREP") for i in mockup)

    def test_no_duplicate_titles(self):
        titles = [i.title for i in CHECKLIST_FALLBACK_CATALOG]
        assert len(set(titles)) == len(titles)

    def test_display_order_is_1_to_n_within_each_category(self):
        by_category: dict[str, list[int]] = {}
        for item in CHECKLIST_FALLBACK_CATALOG:
            by_category.setdefault(item.category_code, []).append(item.display_order)
        assert sorted(by_category["VENUE"]) == list(range(1, 11))
        assert sorted(by_category["SDM"]) == list(range(1, 15))
        for code in MOCKUP_5_ITEM_CATEGORIES:
            assert sorted(by_category[code]) == list(range(1, 6))

    def test_all_source_labels_present_and_official_urls_present(self):
        assert all(i.source_label.strip() for i in CHECKLIST_FALLBACK_CATALOG)
        official = [i for i in CHECKLIST_FALLBACK_CATALOG if i.category_code in ("VENUE", "SDM")]
        assert all(
            i.source_url is not None and i.source_url.startswith("https://www.ftc.go.kr/")
            for i in official
        )

    def test_group_label_is_uniform_per_category_for_venue_and_sdm(self):
        # item_type이 전부 CONTRACT_TERM이라 GROUP_LABEL_BY_ITEM_TYPE 매핑을 쓰면 24개가 전부
        # 같은 값으로 뭉개진다 — 그래서 카테고리 단위 인라인 값을 쓴다(app/core/checklist_catalog.py
        # 모듈 docstring). 카테고리별로는 균일해야 하고, 두 카테고리 값은 서로 달라야 한다.
        venue_labels = {
            i.group_label for i in CHECKLIST_FALLBACK_CATALOG if i.category_code == "VENUE"
        }
        sdm_labels = {i.group_label for i in CHECKLIST_FALLBACK_CATALOG if i.category_code == "SDM"}
        assert len(venue_labels) == 1
        assert len(sdm_labels) == 1
        assert venue_labels != sdm_labels

    def test_mockup_group_label_matches_item_type_mapping(self):
        # 나머지 7개 MOCKUP 카테고리는 item_type이 섞여 있어 GROUP_LABEL_BY_ITEM_TYPE을 그대로
        # 쓴다(모듈 docstring) — VENUE/SDM과 반대 규칙이므로 별도로 확인한다.
        mockup = [
            i for i in CHECKLIST_FALLBACK_CATALOG if i.category_code in MOCKUP_5_ITEM_CATEGORIES
        ]
        assert all(i.group_label == GROUP_LABEL_BY_ITEM_TYPE[i.item_type] for i in mockup)
