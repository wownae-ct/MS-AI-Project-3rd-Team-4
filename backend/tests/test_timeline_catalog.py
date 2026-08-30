"""app/core/timeline_catalog.py 정적 데이터 회귀 테스트 — docs/wedding/ing/
ds7-timeline-seed-data-prep.md 완성본(55항목) + ETC/HOMENEW 신규 저작 10항목 + MEETING/GIFT
표본 보강 3항목(2026-08-24 버그 수정 2건) + 2026-08-30 상세도 보강 16항목(카탈로그 모듈
docstring 참고)과 계속 일치하는지 확인한다."""

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
    def test_has_exactly_84_items(self):
        assert len(TIMELINE_CATALOG) == 84

    def test_display_order_is_1_to_84_unique_and_sequential(self):
        orders = [item.display_order for item in TIMELINE_CATALOG]
        assert orders == list(range(1, 85))

    def test_category_codes_are_none_or_valid(self):
        for item in TIMELINE_CATALOG:
            assert item.category_code is None or item.category_code in _VALID_CATEGORY_CODES

    def test_offsets_are_within_documented_range(self):
        # -365가 하한인 이유는 문서 관례가 아니라 수학적 불변식이다 — 날짜 스케일링
        # (app/services/timeline.py::BASELINE_PREP_DAYS=365)이 offset=-365를 정확히
        # today로 매핑하도록 설계돼 있어, 카탈로그 항목이 이보다 더 음수면(예: -370)
        # 준비기간이 365일 이하인 웨딩에서 target_date가 today 이전으로 나온다(실제로
        # 2026-08-30 상세도 보강 중 이 값으로 CI가 걸려 발견·수정됨, 아래 감사인사 D+14가
        # 상한).
        for item in TIMELINE_CATALOG:
            assert -365 <= item.dday_offset_days <= 14

    def test_offset_sign_distribution_sums_to_84(self):
        # 2026-08-30 상세도 보강(16항목) 이후 실측값 — 음수 77(기존 62 + 신규 15) · 0(당일) 3
        # (변동 없음) · 양수(본식 후) 4(기존 3 + 신규 "전입신고" D+7 1개).
        negative = sum(1 for item in TIMELINE_CATALOG if item.dday_offset_days < 0)
        zero = sum(1 for item in TIMELINE_CATALOG if item.dday_offset_days == 0)
        positive = sum(1 for item in TIMELINE_CATALOG if item.dday_offset_days > 0)
        assert (negative, zero, positive) == (77, 3, 4)

    def test_all_titles_non_empty(self):
        assert all(item.title.strip() for item in TIMELINE_CATALOG)

    def test_etc_and_homenew_have_at_least_one_item(self):
        # 2026-08-24 버그 회귀 방지(수정 1): 이 두 카테고리가 0개면 personalization validate의
        # 카테고리 커버리지 규칙(app/personalization/validation.py)을 상시 통과 못 해 전체 도메인이
        # 매번 BLOCKED 폴백된다 — app/personalization/prompts.py의 few-shot도 이 카탈로그에서
        # 뽑으므로 LLM 경로 자체도 이 항목이 없으면 해당 카테고리를 생성하지 않는다.
        codes = {item.category_code for item in TIMELINE_CATALOG}
        assert "ETC" in codes
        assert "HOMENEW" in codes

    def test_meeting_and_gift_have_at_least_three_items(self):
        # 2026-08-24 버그 회귀 방지(수정 2): 원래 MEETING 1개/GIFT 2개뿐이라 few-shot 노출
        # 표본이 적어 LLM이 이 두 카테고리를 확률적으로 누락시키는 사례가 실계정 재현으로
        # 확인됐다 — 최소 3개는 유지돼야 few-shot에서 충분히 노출된다.
        meeting_count = sum(1 for item in TIMELINE_CATALOG if item.category_code == "MEETING")
        gift_count = sum(1 for item in TIMELINE_CATALOG if item.category_code == "GIFT")
        assert meeting_count >= 3
        assert gift_count >= 3
