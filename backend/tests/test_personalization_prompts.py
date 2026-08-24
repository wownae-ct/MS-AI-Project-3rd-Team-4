"""app/personalization/prompts.py의 few-shot 관련 회귀 테스트 — 2026-08-24 버그 수정 2건이
계속 유지되는지 확인한다: (1) MEETING/GIFT가 대표 예시 1개뿐이라 LLM이 확률적으로 카테고리를
통째로 누락시키던 문제, (2) TIMELINE few-shot이 카탈로그 전체를 그대로 노출해 서로 다른 웨딩
프로필인데도 결과가 거의 동일하게 나오던 문제(개인화 저다양성)."""

from app.core.timeline_catalog import TIMELINE_CATALOG
from app.personalization.prompts import (
    _MOCKUP_CATEGORY_CODES,
    _MOCKUP_FEW_SHOT_SAMPLE_SIZE,
    _build_checklist_few_shot,
    _build_timeline_few_shot,
)


class TestChecklistFewShotSampleSize:
    def test_each_mockup_category_appears_at_least_three_times(self):
        few_shot = _build_checklist_few_shot()
        for category_code in (
            "MEETING",
            "GIFT",
            "HOMEWARE",
            "INVITATION",
            "HONEYMOON",
            "HOMENEW",
            "ETC",
        ):
            assert few_shot.count(f"[{category_code}]") >= 3


class TestTimelineFewShotDiversity:
    def test_mockup_categories_are_capped(self):
        # 2026-08-24 버그 회귀 방지: MOCKUP 카테고리는 카탈로그에 더 많이 있어도 few-shot엔
        # _MOCKUP_FEW_SHOT_SAMPLE_SIZE개까지만 노출돼야 한다 — LLM이 "그대로 베낄 답"을
        # 통째로 받는 걸 막는 핵심 장치.
        few_shot = _build_timeline_few_shot()
        for category_code in _MOCKUP_CATEGORY_CODES:
            assert (
                few_shot.count(f"(category_code={category_code})") <= _MOCKUP_FEW_SHOT_SAMPLE_SIZE
            )

    def test_venue_sdm_and_universal_items_are_shown_in_full(self):
        # VENUE/SDM/범용(None) 항목은 시간축 뼈대라 줄이지 않는다 — 카탈로그의 실제 개수와
        # few-shot에 노출된 개수가 정확히 같아야 한다.
        few_shot = _build_timeline_few_shot()
        for category_code, label in (("VENUE", "VENUE"), ("SDM", "SDM"), (None, "null")):
            catalog_count = sum(
                1 for item in TIMELINE_CATALOG if item.category_code == category_code
            )
            assert few_shot.count(f"(category_code={label})") == catalog_count

    def test_no_natural_language_placeholder_for_null_category(self):
        # 2026-08-24 회귀 방지: "범용" 같은 한글 플레이스홀더를 category_code 자리에 쓰면 LLM이
        # 그 라벨 자체를 실제 값으로 착각해 "category_code": "범용"이라는 존재하지 않는 ENUM
        # 값을 그대로 출력하는 사례가 실계정 2/2 재현으로 확인됐다(few-shot 축소 직후). null
        # 항목은 반드시 리터럴 "null"로만 표기돼야 한다.
        few_shot = _build_timeline_few_shot()
        assert "범용" not in few_shot
