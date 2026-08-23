"""app/core/checklist_catalog.py 정적 데이터 회귀 테스트 — docs/wedding/ing/
ds6-checklist-seed-data-prep.md의 OFFICIAL-tier 24항목(VENUE 10 + SDM 14)과 계속 일치하는지
확인한다(13_personalization_router_agent_design.md §2)."""

from app.core.checklist_catalog import CHECKLIST_FALLBACK_CATALOG


class TestChecklistFallbackCatalog:
    def test_has_exactly_24_items(self):
        assert len(CHECKLIST_FALLBACK_CATALOG) == 24

    def test_venue_10_and_sdm_14(self):
        venue = [i for i in CHECKLIST_FALLBACK_CATALOG if i.category_code == "VENUE"]
        sdm = [i for i in CHECKLIST_FALLBACK_CATALOG if i.category_code == "SDM"]
        assert len(venue) == 10
        assert len(sdm) == 14

    def test_only_venue_and_sdm_categories(self):
        assert {i.category_code for i in CHECKLIST_FALLBACK_CATALOG} == {"VENUE", "SDM"}

    def test_all_items_are_contract_term_and_official(self):
        assert all(i.item_type == "CONTRACT_TERM" for i in CHECKLIST_FALLBACK_CATALOG)
        assert all(i.source_tier == "OFFICIAL" for i in CHECKLIST_FALLBACK_CATALOG)

    def test_no_duplicate_titles(self):
        titles = [i.title for i in CHECKLIST_FALLBACK_CATALOG]
        assert len(set(titles)) == len(titles)

    def test_display_order_is_1_to_10_within_venue_and_1_to_14_within_sdm(self):
        venue_orders = [
            i.display_order for i in CHECKLIST_FALLBACK_CATALOG if i.category_code == "VENUE"
        ]
        sdm_orders = [
            i.display_order for i in CHECKLIST_FALLBACK_CATALOG if i.category_code == "SDM"
        ]
        assert sorted(venue_orders) == list(range(1, 11))
        assert sorted(sdm_orders) == list(range(1, 15))

    def test_all_source_labels_and_urls_present(self):
        assert all(i.source_label.strip() for i in CHECKLIST_FALLBACK_CATALOG)
        assert all(
            i.source_url.startswith("https://www.ftc.go.kr/") for i in CHECKLIST_FALLBACK_CATALOG
        )

    def test_group_label_is_uniform_per_category(self):
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
