"""app/services/timeline.py의 순수 함수 테스트(DB 세션이 필요한 CRUD 함수는 라이브 DB가 있는
사용자 환경에서 확인 — 여기선 generate/recalculate/is_overdue만 다룬다)."""

from datetime import date
from uuid import uuid4

from app.services.timeline import generate_timeline_items, is_overdue, recalculate_timeline_dates


class TestGenerateTimelineItems:
    def test_returns_all_55_items_when_all_categories_active(self):
        active = {"MEETING", "VENUE", "SDM", "GIFT", "HOMEWARE", "INVITATION", "HONEYMOON"}
        rows = generate_timeline_items(date(2027, 5, 15), active, None, date(2026, 8, 24))
        assert len(rows) == 55

    def test_universal_items_always_included_even_with_no_active_categories(self):
        rows = generate_timeline_items(date(2027, 5, 15), set(), None, date(2026, 8, 24))
        assert all(row["category_code"] is None for row in rows)
        assert len(rows) > 0

    def test_category_specific_item_excluded_when_category_inactive(self):
        rows = generate_timeline_items(date(2027, 5, 15), {"VENUE"}, None, date(2026, 8, 24))
        assert all(row["category_code"] in (None, "VENUE") for row in rows)
        assert not any(row["category_code"] == "SDM" for row in rows)

    def test_target_date_is_wedding_date_plus_offset(self):
        rows = generate_timeline_items(date(2027, 5, 15), {"VENUE"}, None, date(2026, 8, 24))
        wedding_day_row = next(r for r in rows if r["title"] == "예식 진행")
        assert wedding_day_row["target_date"] == date(2027, 5, 15)

    def test_done_so_far_marks_past_items_done_only_for_that_category(self):
        # 상견례(MEETING)는 D-12M = 2026-05-16, "오늘"을 2026-08-24로 주면 이미 지난 날짜다.
        rows = generate_timeline_items(
            date(2027, 5, 15), {"MEETING", "VENUE"}, ["MEETING"], date(2026, 8, 24)
        )
        meeting_row = next(r for r in rows if r["category_code"] == "MEETING")
        assert meeting_row["status"] == "DONE"
        # VENUE는 done_so_far에 없으니 같은 과거 날짜라도 TODO로 남아야 한다.
        past_venue_row = next(
            r
            for r in rows
            if r["category_code"] == "VENUE" and r["target_date"] < date(2026, 8, 24)
        )
        assert past_venue_row["status"] == "TODO"

    def test_all_rows_have_llm_origin_and_no_date_override(self):
        rows = generate_timeline_items(date(2027, 5, 15), {"VENUE"}, None, date(2026, 8, 24))
        assert all(row["origin"] == "LLM" for row in rows)
        assert all(row["date_overridden"] is False for row in rows)


class TestRecalculateTimelineDates:
    def test_recalculates_todo_rows_without_override(self):
        item_id = uuid4()
        rows = [(item_id, -30, False, "TODO")]
        updates = recalculate_timeline_dates(date(2027, 6, 1), rows)
        assert updates == {item_id: date(2027, 5, 2)}

    def test_skips_rows_with_date_overridden(self):
        item_id = uuid4()
        rows = [(item_id, -30, True, "TODO")]
        assert recalculate_timeline_dates(date(2027, 6, 1), rows) == {}

    def test_skips_done_rows(self):
        item_id = uuid4()
        rows = [(item_id, -30, False, "DONE")]
        assert recalculate_timeline_dates(date(2027, 6, 1), rows) == {}

    def test_skips_rows_without_offset(self):
        # 사용자가 POST /timeline-items로 직접 추가한 행은 offset이 없다.
        item_id = uuid4()
        rows = [(item_id, None, False, "TODO")]
        assert recalculate_timeline_dates(date(2027, 6, 1), rows) == {}


class TestIsOverdue:
    def test_todo_in_the_past_is_overdue(self):
        assert is_overdue(date(2026, 1, 1), "TODO", date(2026, 8, 24)) is True

    def test_done_in_the_past_is_not_overdue(self):
        assert is_overdue(date(2026, 1, 1), "DONE", date(2026, 8, 24)) is False

    def test_todo_in_the_future_is_not_overdue(self):
        assert is_overdue(date(2027, 1, 1), "TODO", date(2026, 8, 24)) is False
