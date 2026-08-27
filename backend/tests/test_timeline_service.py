"""app/services/timeline.py의 순수 함수 테스트(DB 세션이 필요한 CRUD 함수는 라이브 DB가 있는
사용자 환경에서 확인 — 여기선 generate/recalculate/is_overdue/스케일링 함수만 다룬다)."""

from datetime import date, timedelta
from uuid import uuid4

from app.services.timeline import (
    BASELINE_PREP_DAYS,
    compute_prep_scale_factor,
    generate_timeline_items,
    is_overdue,
    recalculate_timeline_dates,
    rescale_offset_for_date_change,
    scale_dday_offset,
)


class TestGenerateTimelineItems:
    def test_returns_all_58_items_when_original_7_categories_active(self):
        # 2026-08-24 버그 수정으로 MEETING 2개·GIFT 1개가 추가돼(few-shot 표본 보강) 이 7개
        # 카테고리(ETC/HOMENEW 제외) 기준 총계가 55 → 58로 바뀌었다 — app/core/timeline_catalog.py
        # 모듈 docstring "버그 수정 2" 참고.
        active = {"MEETING", "VENUE", "SDM", "GIFT", "HOMEWARE", "INVITATION", "HONEYMOON"}
        rows = generate_timeline_items(date(2027, 5, 15), active, None, date(2026, 8, 24))
        assert len(rows) == 58

    def test_universal_items_always_included_even_with_no_active_categories(self):
        rows = generate_timeline_items(date(2027, 5, 15), set(), None, date(2026, 8, 24))
        assert all(row["category_code"] is None for row in rows)
        assert len(rows) > 0

    def test_category_specific_item_excluded_when_category_inactive(self):
        rows = generate_timeline_items(date(2027, 5, 15), {"VENUE"}, None, date(2026, 8, 24))
        assert all(row["category_code"] in (None, "VENUE") for row in rows)
        assert not any(row["category_code"] == "SDM" for row in rows)

    def test_target_date_is_wedding_date_plus_offset_for_unscaled_items(self):
        # offset=0("예식 진행", 결혼식 당일)은 scale_dday_offset 규칙상 스케일 대상이 아니라
        # 준비기간과 무관하게 항상 wedding_date 그대로다.
        rows = generate_timeline_items(date(2027, 5, 15), {"VENUE"}, None, date(2026, 8, 24))
        wedding_day_row = next(r for r in rows if r["title"] == "예식 진행")
        assert wedding_day_row["target_date"] == date(2027, 5, 15)

    def test_negative_offsets_are_scaled_to_actual_prep_period(self):
        # 2026-08-28 — 준비기간 스케일링 핵심 동작. 카탈로그 최솟값 offset(-365, "예식장 투어
        # 시작" 등)은 compute_prep_scale_factor 설계상 항상 정확히 -remaining_days로 스케일돼,
        # 스케일된 target_date는 늘 정확히 today와 같아야 한다 — 준비기간이 표준(365일)보다
        # 짧은 케이스(182일)로 이를 검증한다.
        today = date(2026, 8, 24)
        wedding_date = today + timedelta(days=182)
        rows = generate_timeline_items(wedding_date, {"VENUE"}, None, today)
        earliest_row = min(rows, key=lambda r: r["target_date"])
        assert earliest_row["target_date"] == today

    def test_done_so_far_marks_raw_past_items_done_only_for_that_category(self):
        # done_so_far DONE 판정은 스케일 전(raw) offset 기준 target_date로 한다(2026-08-28
        # 사용자 결정 — generate_timeline_items 모듈 docstring 참고). wedding_date를 표준
        # 준비기간(365일)보다 짧게 줘서(2027-05-15, 오늘로부터 264일) MEETING의 모든 원본
        # offset(-365/-365/-350)이 raw 기준 이미 지난 조건을 재현한다.
        rows = generate_timeline_items(
            date(2027, 5, 15), {"MEETING", "VENUE"}, ["MEETING"], date(2026, 8, 24)
        )
        meeting_rows = [r for r in rows if r["category_code"] == "MEETING"]
        assert meeting_rows
        assert all(r["status"] == "DONE" for r in meeting_rows)
        # VENUE는 done_so_far에 없으니 같은 raw 과거 offset(-365 포함)이라도 TODO로 남아야 한다.
        venue_rows = [r for r in rows if r["category_code"] == "VENUE"]
        assert venue_rows
        assert all(r["status"] == "TODO" for r in venue_rows)

    def test_all_rows_have_llm_origin_and_no_date_override(self):
        rows = generate_timeline_items(date(2027, 5, 15), {"VENUE"}, None, date(2026, 8, 24))
        assert all(row["origin"] == "LLM" for row in rows)
        assert all(row["date_overridden"] is False for row in rows)


class TestComputePrepScaleFactor:
    def test_returns_one_when_remaining_days_equals_baseline(self):
        today = date(2026, 8, 24)
        factor = compute_prep_scale_factor(today, today + timedelta(days=BASELINE_PREP_DAYS))
        assert factor == 1.0

    def test_returns_less_than_one_when_remaining_days_shorter_than_baseline(self):
        factor = compute_prep_scale_factor(date(2026, 8, 24), date(2026, 11, 24))
        assert factor < 1.0

    def test_returns_more_than_one_when_remaining_days_longer_than_baseline(self):
        # stretch 허용(2026-08-28 사용자 결정) — 1.0 cap이 아니라 실제로 1을 넘는다.
        factor = compute_prep_scale_factor(date(2026, 8, 24), date(2028, 8, 24))
        assert factor > 1.0

    def test_clamps_to_minimum_one_day_when_wedding_date_not_in_future(self):
        # 비정상 입력(이미 지난 날짜 등) — 분모/분자가 0 이하가 되는 걸 막는다.
        factor = compute_prep_scale_factor(date(2026, 8, 24), date(2026, 8, 24))
        assert factor == 1 / BASELINE_PREP_DAYS


class TestScaleDdayOffset:
    def test_compresses_negative_offset_when_factor_below_one(self):
        assert scale_dday_offset(-100, 0.5) == -50

    def test_stretches_negative_offset_when_factor_above_one(self):
        assert scale_dday_offset(-100, 2.0) == -200

    def test_leaves_non_negative_offset_unscaled(self):
        assert scale_dday_offset(0, 0.5) == 0
        assert scale_dday_offset(14, 0.5) == 14
        assert scale_dday_offset(14, 2.0) == 14


class TestRescaleOffsetForDateChange:
    def test_leaves_non_negative_offset_unchanged(self):
        result = rescale_offset_for_date_change(
            14, date(2027, 5, 15), date(2027, 8, 15), date(2026, 8, 24), date(2026, 9, 1)
        )
        assert result == 14

    def test_undoes_old_scale_and_applies_new_scale(self):
        # 온보딩 시점(2026-08-24)에 wedding_date=2027-08-24(remaining=365, factor=1.0)로
        # 저장된 offset=-100은 raw 그대로 -100이다. wedding_date를 2028-08-24(오늘 기준
        # remaining=730, factor=2.0)로 크게 미루면 raw -100이 새 스케일로 -200이 돼야 한다.
        result = rescale_offset_for_date_change(
            -100, date(2027, 8, 24), date(2028, 8, 24), date(2026, 8, 24), date(2026, 8, 24)
        )
        assert result == -200


class TestRecalculateTimelineDates:
    def test_locks_scale_when_change_is_below_threshold(self):
        # 5개월(150일) 미만 변경 — 저장된 offset을 그대로 new_wedding_date에 더한다(온보딩
        # 시점 스케일 고정, 2026-08-28 사용자 결정).
        item_id = uuid4()
        rows = [(item_id, -30, False, "TODO")]
        updates = recalculate_timeline_dates(
            date(2027, 6, 1), date(2027, 6, 20), date(2026, 8, 24), date(2026, 8, 24), rows
        )
        assert updates == {item_id: (date(2027, 5, 21), -30)}

    def test_rescales_when_change_is_at_or_above_threshold(self):
        # 5개월(150일) 이상 변경 — old_wedding_date(2027-08-24, onboarding_date 기준 remaining=
        # 365, factor=1.0)에서 저장된 offset=-100(raw도 -100)을 new_wedding_date(2028-08-24,
        # today 기준 remaining=730, factor=2.0)로 재스케일하면 -200이 된다.
        item_id = uuid4()
        rows = [(item_id, -100, False, "TODO")]
        updates = recalculate_timeline_dates(
            date(2027, 8, 24), date(2028, 8, 24), date(2026, 8, 24), date(2026, 8, 24), rows
        )
        assert updates == {item_id: (date(2028, 8, 24) - timedelta(days=200), -200)}

    def test_skips_rows_with_date_overridden(self):
        item_id = uuid4()
        rows = [(item_id, -30, True, "TODO")]
        updates = recalculate_timeline_dates(
            date(2027, 6, 1), date(2027, 6, 1), date(2026, 8, 24), date(2026, 8, 24), rows
        )
        assert updates == {}

    def test_skips_done_rows(self):
        item_id = uuid4()
        rows = [(item_id, -30, False, "DONE")]
        updates = recalculate_timeline_dates(
            date(2027, 6, 1), date(2027, 6, 1), date(2026, 8, 24), date(2026, 8, 24), rows
        )
        assert updates == {}

    def test_skips_rows_without_offset(self):
        # 사용자가 POST /timeline-items로 직접 추가한 행은 offset이 없다.
        item_id = uuid4()
        rows = [(item_id, None, False, "TODO")]
        updates = recalculate_timeline_dates(
            date(2027, 6, 1), date(2027, 6, 1), date(2026, 8, 24), date(2026, 8, 24), rows
        )
        assert updates == {}


class TestIsOverdue:
    def test_todo_in_the_past_is_overdue(self):
        assert is_overdue(date(2026, 1, 1), "TODO", date(2026, 8, 24)) is True

    def test_done_in_the_past_is_not_overdue(self):
        assert is_overdue(date(2026, 1, 1), "DONE", date(2026, 8, 24)) is False

    def test_todo_in_the_future_is_not_overdue(self):
        assert is_overdue(date(2027, 1, 1), "TODO", date(2026, 8, 24)) is False
