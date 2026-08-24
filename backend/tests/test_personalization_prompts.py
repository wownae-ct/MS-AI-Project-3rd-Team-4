"""app/personalization/prompts.py의 few-shot 관련 회귀 테스트 — 2026-08-24 버그 수정 3건이
계속 유지되는지 확인한다: (1) MEETING/GIFT가 대표 예시 1개뿐이라 LLM이 확률적으로 카테고리를
통째로 누락시키던 문제, (2) TIMELINE few-shot이 카탈로그 전체를 그대로 노출해 서로 다른 웨딩
프로필인데도 결과가 거의 동일하게 나오던 문제(개인화 저다양성), (3) null 항목을 사람이 읽는
텍스트 라벨("범용"→"null" 두 번 다 재발)로 표시해 LLM이 그 라벨을 category_code 값으로
착각하던 문제 — few-shot을 실제 JSON으로 바꿔 구조적으로 해결."""

import json

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


def _parse_timeline_few_shot_entries() -> list[dict]:
    """첫 줄(헤더 설명)을 제외한 나머지를 JSON 한 줄씩 파싱한다."""
    lines = _build_timeline_few_shot().splitlines()
    return [json.loads(line) for line in lines[1:]]


class TestTimelineFewShotDiversity:
    def test_mockup_categories_are_capped(self):
        # 2026-08-24 버그 회귀 방지: MOCKUP 카테고리는 카탈로그에 더 많이 있어도 few-shot엔
        # _MOCKUP_FEW_SHOT_SAMPLE_SIZE개까지만 노출돼야 한다 — LLM이 "그대로 베낄 답"을
        # 통째로 받는 걸 막는 핵심 장치.
        entries = _parse_timeline_few_shot_entries()
        for category_code in _MOCKUP_CATEGORY_CODES:
            count = sum(1 for entry in entries if entry["category_code"] == category_code)
            assert count <= _MOCKUP_FEW_SHOT_SAMPLE_SIZE

    def test_venue_sdm_and_universal_items_are_shown_in_full(self):
        # VENUE/SDM/범용(None) 항목은 시간축 뼈대라 줄이지 않는다 — 카탈로그의 실제 개수와
        # few-shot에 노출된 개수가 정확히 같아야 한다. None 카테고리 개수가 일치한다는 건
        # json.loads가 실제 JSON null(파이썬 None)로 파싱했다는 뜻이기도 하다 — 문자열
        # "null"이었다면 이 비교가 실패한다(아래 버그 수정 3 테스트와 이중 보장).
        entries = _parse_timeline_few_shot_entries()
        for category_code in (None, "VENUE", "SDM"):
            catalog_count = sum(
                1 for item in TIMELINE_CATALOG if item.category_code == category_code
            )
            few_shot_count = sum(1 for entry in entries if entry["category_code"] == category_code)
            assert few_shot_count == catalog_count


class TestTimelineFewShotIsValidJson:
    def test_every_line_after_header_parses_as_valid_json(self):
        # 2026-08-24 버그 회귀 방지(수정 3) — 이전 두 시도(사람이 읽는 텍스트 라벨 "범용"→
        # "null")는 둘 다 LLM이 라벨 문자열을 category_code 값으로 착각하는 문제가 재발했다.
        # few-shot을 실제 JSON으로 바꿔서 이 클래스의 버그 자체를 구조적으로 막는다 — 각 줄이
        # 유효한 JSON으로 파싱되고 필드가 출력 스키마와 일치해야 한다.
        entries = _parse_timeline_few_shot_entries()
        assert len(entries) > 0
        for entry in entries:
            assert set(entry.keys()) == {"category_code", "title", "default_dday_offset_days"}

    def test_no_natural_language_placeholder_anywhere(self):
        few_shot = _build_timeline_few_shot()
        assert "범용" not in few_shot
