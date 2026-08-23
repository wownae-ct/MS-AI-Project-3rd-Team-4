"""app/services/personalization.py의 DB-independent 헬퍼 테스트(DB 세션이 필요한
run_personalization 자체는 라이브 DB가 있는 사용자 환경에서 확인 — app/services/timeline.py·
checklist.py·wedding.py 테스트와 같은 이 레포의 기존 컨벤션). ORM 모델(ChecklistItem/TimelineItem)
을 세션에 add하지 않고 순수 인스턴스로만 만들어 필드 값을 검증한다."""

from datetime import date

from app.models import Wedding
from app.services.personalization import (
    _build_profile,
    _checklist_fallback_rows,
    _checklist_row_from_draft,
    _timeline_fallback_rows,
    _timeline_row_from_draft,
    _timeline_status,
)


def _make_wedding(**overrides) -> Wedding:
    defaults = {
        "wedding_date": date(2027, 5, 15),
        "wedding_date_precision": "EXACT",
        "total_budget": 45_000_000,
        "region_code": "SEOUL_GANGNAM",
        "taste_preference": "BALANCED",
        "venue_priority": "LOCATION",
        "sdm_priority": "DRESS",
        "primary_goals": ["BUDGET_CONTROL"],
        "priorities": None,
    }
    defaults.update(overrides)
    return Wedding(**defaults)


class TestBuildProfile:
    def test_includes_active_categories_sorted(self):
        wedding = _make_wedding()

        profile = _build_profile(wedding, {"SDM", "VENUE"})

        assert profile["active_categories"] == ["SDM", "VENUE"]

    def test_wedding_date_is_isoformat_string(self):
        wedding = _make_wedding()

        profile = _build_profile(wedding, {"VENUE"})

        assert profile["wedding_date"] == "2027-05-15"


class TestTimelineStatus:
    def test_done_when_category_in_done_so_far_and_past(self):
        status = _timeline_status("VENUE", {"VENUE"}, date(2026, 1, 1), date(2026, 8, 24))
        assert status == "DONE"

    def test_todo_when_category_not_in_done_so_far(self):
        status = _timeline_status("VENUE", set(), date(2026, 1, 1), date(2026, 8, 24))
        assert status == "TODO"

    def test_todo_when_target_date_in_future_even_if_done_so_far(self):
        status = _timeline_status("VENUE", {"VENUE"}, date(2027, 1, 1), date(2026, 8, 24))
        assert status == "TODO"


class TestChecklistRowFromDraft:
    def test_category_not_active_returns_none(self):
        # 사용자가 지적한 버그 축: SUCCESS 경로에서도 활성 카테고리 밖 항목은 버려야 한다.
        item = {"category_code": "SDM", "title": "제목"}
        row = _checklist_row_from_draft({"VENUE"}, item)
        assert row is None

    def test_group_label_derived_from_item_type(self):
        item = {"category_code": "VENUE", "title": "제목", "item_type": "EXTRA_COST"}
        row = _checklist_row_from_draft({"VENUE"}, item)
        assert row.group_label == "추가 비용 확인"

    def test_status_set_deterministically_not_from_llm(self):
        # 출력 스키마 자체가 status를 요청하지 않으므로 항상 default_status_for_category 결과다.
        item = {"category_code": "HOMEWARE", "title": "제목", "item_type": "PREP"}
        row = _checklist_row_from_draft({"HOMEWARE"}, item)
        assert row.status == "LISTED"

    def test_origin_is_always_llm(self):
        item = {"category_code": "VENUE", "title": "제목"}
        row = _checklist_row_from_draft({"VENUE"}, item)
        assert row.origin == "LLM"

    def test_source_tier_is_none_for_llm_generated_items(self):
        item = {"category_code": "VENUE", "title": "제목"}
        row = _checklist_row_from_draft({"VENUE"}, item)
        assert row.source_tier is None


class TestChecklistFallbackRows:
    def test_filters_out_inactive_categories(self):
        # 24항목은 VENUE 10 + SDM 14 고정이므로 SDM을 비활성으로 주면 VENUE 10개만 나와야 한다.
        rows = _checklist_fallback_rows({"VENUE"})
        assert len(rows) == 10
        assert all(r.category_code == "VENUE" for r in rows)

    def test_both_active_returns_all_24(self):
        rows = _checklist_fallback_rows({"VENUE", "SDM"})
        assert len(rows) == 24

    def test_neither_active_returns_empty(self):
        rows = _checklist_fallback_rows({"MEETING"})
        assert rows == []

    def test_fallback_rows_have_llm_origin_and_official_source_tier(self):
        rows = _checklist_fallback_rows({"VENUE"})
        assert all(r.origin == "LLM" for r in rows)
        assert all(r.source_tier == "OFFICIAL" for r in rows)


class TestTimelineRowFromDraft:
    def test_target_date_is_wedding_date_plus_offset(self):
        item = {"category_code": "VENUE", "title": "제목", "default_dday_offset_days": -30}
        row = _timeline_row_from_draft(date(2027, 5, 15), set(), date(2026, 8, 24), 1, item)
        assert row.target_date == date(2027, 4, 15)

    def test_origin_is_llm_and_not_date_overridden(self):
        item = {"category_code": "VENUE", "title": "제목", "default_dday_offset_days": 0}
        row = _timeline_row_from_draft(date(2027, 5, 15), set(), date(2026, 8, 24), 1, item)
        assert row.origin == "LLM"
        assert row.date_overridden is False


class TestTimelineFallbackRows:
    def test_delegates_to_generate_timeline_items_and_filters_by_active_categories(self):
        rows = _timeline_fallback_rows(date(2027, 5, 15), {"VENUE"}, None, date(2026, 8, 24))
        assert all(r.category_code in (None, "VENUE") for r in rows)
        assert not any(r.category_code == "SDM" for r in rows)
