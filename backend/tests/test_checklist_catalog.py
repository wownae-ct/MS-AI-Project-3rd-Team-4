"""app/core/checklist_catalog.py 정적 데이터 회귀 테스트.

VENUE 25항목(CONTRACT_TERM 10 OFFICIAL + EXTRA_COST 10 CONSENSUS + PREP 5 CONSENSUS)·SDM
35항목(CONTRACT_TERM 14 OFFICIAL + EXTRA_COST 18[CONSENSUS 17 + OFFICIAL 1] + PREP 3
CONSENSUS)은 data/rag_corpus/DS6_CHECK/checklist.md와, 나머지 7개 MOCKUP 카테고리 35항목
(CONSENSUS)은 00_BASELINE.md §0-2 Should "MOCKUP 7개 카테고리 얇은 시드"와 계속 일치하는지
확인한다(13_personalization_router_agent_design.md §2)."""

from typing import get_args

from app.core.checklist_catalog import CHECKLIST_FALLBACK_CATALOG, GROUP_LABEL_BY_ITEM_TYPE
from app.schemas.common import CategoryCode

ALL_CATEGORY_CODES = frozenset(get_args(CategoryCode))
MOCKUP_5_ITEM_CATEGORIES = frozenset(
    {"MEETING", "GIFT", "HOMEWARE", "INVITATION", "HONEYMOON", "HOMENEW", "ETC"}
)
# SDM EXTRA_COST 중 유일하게 공정위 표준계약서 붙임2를 근거로 삼은 OFFICIAL 항목 — 나머지
# VENUE/SDM EXTRA_COST·PREP은 전부 CONSENSUS다(app/core/checklist_catalog.py 모듈 docstring).
_SDM_OFFICIAL_EXTRA_COST_TITLE = (
    "취소·일정 변경 시 위약금이 촬영일에 가까울수록 급증하는 구조임을 인지"
)


class TestChecklistFallbackCatalog:
    def test_has_exactly_95_items(self):
        assert len(CHECKLIST_FALLBACK_CATALOG) == 25 + 35 + 7 * 5

    def test_venue_25_sdm_35_and_each_mockup_category_has_5(self):
        by_category: dict[str, int] = {}
        for item in CHECKLIST_FALLBACK_CATALOG:
            by_category[item.category_code] = by_category.get(item.category_code, 0) + 1
        assert by_category["VENUE"] == 25
        assert by_category["SDM"] == 35
        for code in MOCKUP_5_ITEM_CATEGORIES:
            assert by_category[code] == 5

    def test_all_9_categories_covered(self):
        assert {i.category_code for i in CHECKLIST_FALLBACK_CATALOG} == ALL_CATEGORY_CODES

    def test_venue_and_sdm_contract_term_items_are_official(self):
        contract_terms = [
            i
            for i in CHECKLIST_FALLBACK_CATALOG
            if i.category_code in ("VENUE", "SDM") and i.item_type == "CONTRACT_TERM"
        ]
        assert len(contract_terms) == 10 + 14
        assert all(i.source_tier == "OFFICIAL" for i in contract_terms)

    def test_venue_and_sdm_have_extra_cost_and_prep_too(self):
        # 회귀 방지 대상 버그 — 폴백을 타면 VENUE/SDM은 CONTRACT_TERM만 있어서 체크리스트 탭
        # "계약 조항만 보기"를 꺼도 나머지 그룹이 비어 보였다(사용자 리포트 2026-08-26).
        for category, expected_extra_cost, expected_prep in (("VENUE", 10, 5), ("SDM", 18, 3)):
            items = [i for i in CHECKLIST_FALLBACK_CATALOG if i.category_code == category]
            assert sum(1 for i in items if i.item_type == "EXTRA_COST") == expected_extra_cost
            assert sum(1 for i in items if i.item_type == "PREP") == expected_prep

    def test_venue_and_sdm_extra_cost_and_prep_are_consensus_except_one_sdm_item(self):
        non_contract_term = [
            i
            for i in CHECKLIST_FALLBACK_CATALOG
            if i.category_code in ("VENUE", "SDM") and i.item_type != "CONTRACT_TERM"
        ]
        official = [i for i in non_contract_term if i.source_tier == "OFFICIAL"]
        consensus = [i for i in non_contract_term if i.source_tier == "CONSENSUS"]
        assert len(official) == 1
        assert official[0].category_code == "SDM"
        assert official[0].title == _SDM_OFFICIAL_EXTRA_COST_TITLE
        assert len(consensus) == len(non_contract_term) - 1
        assert all(i.source_url is None for i in consensus)

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
        assert sorted(by_category["VENUE"]) == list(range(1, 26))
        assert sorted(by_category["SDM"]) == list(range(1, 36))
        for code in MOCKUP_5_ITEM_CATEGORIES:
            assert sorted(by_category[code]) == list(range(1, 6))

    def test_all_source_labels_present_and_official_urls_present(self):
        assert all(i.source_label.strip() for i in CHECKLIST_FALLBACK_CATALOG)
        official = [i for i in CHECKLIST_FALLBACK_CATALOG if i.source_tier == "OFFICIAL"]
        assert official  # 최소 하나는 있어야 아래 검증이 공허하게 통과하지 않는다.
        assert all(
            i.source_url is not None and i.source_url.startswith("https://www.ftc.go.kr/")
            for i in official
        )

    def test_group_label_is_uniform_for_venue_and_sdm_contract_term(self):
        # CONTRACT_TERM(OFFICIAL, 법조문 근거)만 카테고리 전용 라벨을 쓴다 — "표준약관/표준계약서
        # 확인"이 EXTRA_COST/PREP(CONSENSUS 실무 팁)에는 안 어울려서다(모듈 docstring 2026-08-26
        # 수정 참고).
        venue_labels = {
            i.group_label
            for i in CHECKLIST_FALLBACK_CATALOG
            if i.category_code == "VENUE" and i.item_type == "CONTRACT_TERM"
        }
        sdm_labels = {
            i.group_label
            for i in CHECKLIST_FALLBACK_CATALOG
            if i.category_code == "SDM" and i.item_type == "CONTRACT_TERM"
        }
        assert len(venue_labels) == 1
        assert len(sdm_labels) == 1
        assert venue_labels != sdm_labels

    def test_venue_and_sdm_extra_cost_and_prep_group_label_matches_item_type_mapping(self):
        non_contract_term = [
            i
            for i in CHECKLIST_FALLBACK_CATALOG
            if i.category_code in ("VENUE", "SDM") and i.item_type != "CONTRACT_TERM"
        ]
        assert all(
            i.group_label == GROUP_LABEL_BY_ITEM_TYPE[i.item_type] for i in non_contract_term
        )

    def test_mockup_group_label_matches_item_type_mapping(self):
        # 나머지 7개 MOCKUP 카테고리는 item_type이 섞여 있어 GROUP_LABEL_BY_ITEM_TYPE을 그대로
        # 쓴다(모듈 docstring) — VENUE/SDM CONTRACT_TERM과 반대 규칙이므로 별도로 확인한다.
        mockup = [
            i for i in CHECKLIST_FALLBACK_CATALOG if i.category_code in MOCKUP_5_ITEM_CATEGORIES
        ]
        assert all(i.group_label == GROUP_LABEL_BY_ITEM_TYPE[i.item_type] for i in mockup)
