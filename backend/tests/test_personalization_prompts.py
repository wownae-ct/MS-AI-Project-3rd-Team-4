"""app/personalization/prompts.py의 few-shot 샘플 개수 회귀 테스트 — 2026-08-24 버그 수정
(MEETING/GIFT가 대표 예시 1개뿐이라 LLM이 확률적으로 카테고리를 통째로 누락시키던 문제)이
계속 유지되는지 확인한다."""

from app.personalization.prompts import _build_checklist_few_shot


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
