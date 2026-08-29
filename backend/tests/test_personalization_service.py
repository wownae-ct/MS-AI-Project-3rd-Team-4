"""app/services/personalization.py의 DB-independent 헬퍼 테스트(DB 세션이 필요한
run_personalization 자체는 라이브 DB가 있는 사용자 환경에서 확인 — app/services/timeline.py·
checklist.py·wedding.py 테스트와 같은 이 레포의 기존 컨벤션). ORM 모델(ChecklistItem/TimelineItem)
을 세션에 add하지 않고 순수 인스턴스로만 만들어 필드 값을 검증한다."""

from datetime import date, timedelta

from sqlalchemy.dialects import postgresql

from app.models import ChecklistItem, TimelineItem, Wedding
from app.services.personalization import (
    _build_profile,
    _checklist_fallback_rows,
    _checklist_protected_clause,
    _checklist_row_from_draft,
    _drop_rows_colliding_with_protected,
    _merge_checklist_rows,
    _timeline_fallback_rows,
    _timeline_protected_clause,
    _timeline_row_from_draft,
    _timeline_status,
)


def _compiled_sql(clause) -> str:
    return str(clause.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))


def _compiled_timeline_protected_sql() -> str:
    return _compiled_sql(_timeline_protected_clause())


def _compiled_checklist_protected_sql() -> str:
    return _compiled_sql(_checklist_protected_clause())


def _make_wedding(**overrides) -> Wedding:
    defaults = {
        "user_role": "BRIDE",
        "wedding_date": date(2027, 5, 15),
        "wedding_date_precision": "EXACT",
        "total_budget": 45_000_000,
        "total_budget_unsure": False,
        "region_code": "SEOUL_GANGNAM",
        "guest_count": 200,
        "guest_count_unsure": False,
        "taste_preference": "BALANCED",
        "venue_priority": "LOCATION",
        "sdm_priority": "DRESS",
        "primary_goals": ["BUDGET_CONTROL"],
    }
    defaults.update(overrides)
    return Wedding(**defaults)


class TestBuildProfile:
    def test_includes_active_categories_sorted(self):
        wedding = _make_wedding()

        profile = _build_profile(wedding, {"SDM", "VENUE"}, {})

        assert profile["active_categories"] == ["SDM", "VENUE"]

    def test_wedding_date_is_isoformat_string(self):
        wedding = _make_wedding()

        profile = _build_profile(wedding, {"VENUE"}, {})

        assert profile["wedding_date"] == "2027-05-15"

    def test_includes_user_role(self):
        wedding = _make_wedding(user_role="GROOM")

        profile = _build_profile(wedding, {"VENUE"}, {})

        assert profile["user_role"] == "GROOM"

    def test_includes_guest_count_fields(self):
        wedding = _make_wedding(guest_count=150, guest_count_unsure=False)

        profile = _build_profile(wedding, {"VENUE"}, {})

        assert profile["guest_count"] == 150
        assert profile["guest_count_unsure"] is False

    def test_includes_total_budget_unsure(self):
        wedding = _make_wedding(total_budget_unsure=True)

        profile = _build_profile(wedding, {"VENUE"}, {})

        assert profile["total_budget_unsure"] is True

    def test_includes_selected_options_passed_in(self):
        wedding = _make_wedding()

        profile = _build_profile(wedding, {"SDM"}, {"SDM": ["드레스", "메이크업"]})

        assert profile["selected_options"] == {"SDM": ["드레스", "메이크업"]}

    def test_custom_request_defaults_to_none_when_unset(self):
        # 2026-08-28 신규 필드 — 기존 fixture(_make_wedding의 defaults)가 이 키를 안 넘겨도
        # 조용히 None이어야 한다(기존 웨딩 회귀 없음 확인).
        wedding = _make_wedding()

        profile = _build_profile(wedding, {"VENUE"}, {})

        assert profile["custom_request"] is None

    def test_includes_custom_request_when_set(self):
        wedding = _make_wedding(custom_request="채식 하객이 많아 식사 옵션이 걱정돼요")

        profile = _build_profile(wedding, {"VENUE"}, {})

        assert profile["custom_request"] == "채식 하객이 많아 식사 옵션이 걱정돼요"


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
        row = _checklist_row_from_draft({"VENUE"}, 1, item)
        assert row is None

    def test_group_label_derived_from_item_type(self):
        item = {"category_code": "VENUE", "title": "제목", "item_type": "EXTRA_COST"}
        row = _checklist_row_from_draft({"VENUE"}, 1, item)
        assert row.group_label == "추가 비용 확인"

    def test_status_set_deterministically_not_from_llm(self):
        # 출력 스키마 자체가 status를 요청하지 않으므로 항상 default_status_for_category 결과다.
        item = {"category_code": "HOMEWARE", "title": "제목", "item_type": "PREP"}
        row = _checklist_row_from_draft({"HOMEWARE"}, 1, item)
        assert row.status == "LISTED"

    def test_origin_is_always_llm(self):
        item = {"category_code": "VENUE", "title": "제목"}
        row = _checklist_row_from_draft({"VENUE"}, 1, item)
        assert row.origin == "LLM"

    def test_display_order_preserves_llm_order(self):
        # 2026-08-29 — 예전엔 이 필드를 안 채워 SUCCESS 경로 행이 전부 NULL이었고,
        # list_checklist_items의 ORDER BY display_order에서 순서가 요청마다 달라졌다.
        item = {"category_code": "VENUE", "title": "제목"}
        assert _checklist_row_from_draft({"VENUE"}, 7, item).display_order == 7

    def test_source_tier_is_none_for_llm_generated_items(self):
        item = {"category_code": "VENUE", "title": "제목"}
        row = _checklist_row_from_draft({"VENUE"}, 1, item)
        assert row.source_tier is None

    def test_source_fields_pass_through_when_resolved_by_generate_node(self):
        # generate_node가 DS3 RAG grounding으로 source_ref_id를 실제 citation으로 이미 치환해둔
        # 경우(app/personalization/graph.py::_resolve_checklist_citations) — 이 함수는 그 값을
        # 그대로 신뢰만 하고 검색을 다시 하지 않는다.
        item = {
            "category_code": "VENUE",
            "title": "계약금 10% 상한 확인",
            "item_type": "CONTRACT_TERM",
            "source_tier": "OFFICIAL",
            "source_label": "공정위 예식장이용 표준약관(제10030호)",
            "source_url": "https://example.com/venue-terms",
        }
        row = _checklist_row_from_draft({"VENUE"}, 1, item)
        assert row.source_tier == "OFFICIAL"
        assert row.source_label == "공정위 예식장이용 표준약관(제10030호)"
        assert row.source_url == "https://example.com/venue-terms"


class TestChecklistFallbackRows:
    def test_filters_out_inactive_categories(self):
        # VENUE 25개(CONTRACT_TERM 10 + EXTRA_COST 10 + PREP 5, 2026-08-26 확장 —
        # app/core/checklist_catalog.py 모듈 docstring)이므로 SDM을 비활성으로 주면 VENUE
        # 25개만 나와야 한다.
        rows = _checklist_fallback_rows({"VENUE"})
        assert len(rows) == 25
        assert all(r.category_code == "VENUE" for r in rows)

    def test_both_active_returns_all_60(self):
        rows = _checklist_fallback_rows({"VENUE", "SDM"})
        assert len(rows) == 60

    def test_empty_active_categories_returns_empty(self):
        rows = _checklist_fallback_rows(set())
        assert rows == []

    def test_fallback_rows_have_catalog_fallback_origin(self):
        # 2026-08-28 origin='LLM' mislabel 수정 — 폴백 카탈로그 행은 이제 "CATALOG_FALLBACK"
        # (진짜 LLM 성공분은 _checklist_row_from_draft가 "LLM"으로 찍음, 아래 클래스 참고).
        rows = _checklist_fallback_rows({"VENUE"})
        assert all(r.origin == "CATALOG_FALLBACK" for r in rows)

    def test_venue_contract_term_rows_are_official_rest_are_consensus(self):
        # VENUE의 CONTRACT_TERM(표준약관 조문 근거)만 OFFICIAL이고, 2026-08-26에 추가된
        # EXTRA_COST/PREP(팀 자체 정리 실무 팁)은 CONSENSUS다 — 회귀 방지: 전부 OFFICIAL이라고
        # 잘못 단언하면 다음에 EXTRA_COST/PREP이 다시 빠져도 이 테스트가 못 잡는다.
        rows = _checklist_fallback_rows({"VENUE"})
        contract_term_rows = [r for r in rows if r.item_type == "CONTRACT_TERM"]
        other_rows = [r for r in rows if r.item_type != "CONTRACT_TERM"]
        assert len(contract_term_rows) == 10
        assert len(other_rows) == 15
        assert all(r.source_tier == "OFFICIAL" for r in contract_term_rows)
        assert all(r.source_tier == "CONSENSUS" for r in other_rows)

    def test_mockup_category_now_covered_with_consensus_source_tier(self):
        # 00_BASELINE.md §0-2 Should "MOCKUP 7개 카테고리 얇은 시드" — MEETING은 VENUE/SDM처럼
        # OFFICIAL 근거가 아니라 CONSENSUS(팀 자체 정리) 5항목으로 커버된다.
        rows = _checklist_fallback_rows({"MEETING"})
        assert len(rows) == 5
        assert all(r.category_code == "MEETING" for r in rows)
        assert all(r.source_tier == "CONSENSUS" for r in rows)


class TestMergeChecklistRows:
    """2026-08-30 결정(red-bug.md #9-11)의 핵심 수정 — 카테고리 단위 폴백 병합. staging
    실측(CHECKLIST 80% BLOCKED, VENUE 1개만 성공해도 그 결과까지 카탈로그로 갈아엎힘)의
    직접적인 회귀 테스트다."""

    def test_all_categories_succeed_uses_llm_draft_only(self):
        active = {"VENUE", "SDM"}
        draft = [
            {"category_code": "VENUE", "title": "체크1"},
            {"category_code": "SDM", "title": "체크2"},
        ]

        rows = _merge_checklist_rows(active, set(), draft)

        assert len(rows) == 2
        assert all(r.origin == "LLM" for r in rows)

    def test_one_blocked_category_falls_back_only_for_that_category(self):
        # 이번 재발 버그의 핵심 재현 — VENUE만 성공(LLM), SDM은 BLOCKED. 예전 도메인 단위
        # 폴백이었다면 VENUE의 LLM 결과까지 버려지고 60개(VENUE 25 + SDM 35) 전부 카탈로그가
        # 됐을 것이다. 이제는 VENUE 1개(LLM) + SDM 35개(카탈로그)만 나와야 한다.
        active = {"VENUE", "SDM"}
        draft = [{"category_code": "VENUE", "title": "체크1"}]

        rows = _merge_checklist_rows(active, {"SDM"}, draft)

        venue_rows = [r for r in rows if r.category_code == "VENUE"]
        sdm_rows = [r for r in rows if r.category_code == "SDM"]
        assert len(venue_rows) == 1
        assert venue_rows[0].origin == "LLM"
        assert len(sdm_rows) == 35
        assert all(r.origin == "CATALOG_FALLBACK" for r in sdm_rows)

    def test_all_categories_blocked_matches_full_catalog_fallback(self):
        active = {"VENUE"}

        rows = _merge_checklist_rows(active, {"VENUE"}, [])

        assert len(rows) == 25
        assert all(r.origin == "CATALOG_FALLBACK" for r in rows)

    def test_display_order_is_contiguous_and_gapless_across_origins(self):
        # LLM 출처(원래 idx 1부터)와 카탈로그 출처(카탈로그 고정 display_order)가 그대로
        # 섞이면 번호가 겹칠 수 있다 — 병합 후 새로 매긴 번호는 1부터 연속이어야 한다.
        active = {"VENUE", "MEETING"}
        draft = [{"category_code": "MEETING", "title": "체크1"}]

        rows = _merge_checklist_rows(active, {"VENUE"}, draft)

        orders = sorted(r.display_order for r in rows)
        assert orders == list(range(1, len(rows) + 1))

    def test_rows_are_grouped_by_category_in_sorted_order(self):
        active = {"VENUE", "MEETING"}
        draft = [
            {"category_code": "MEETING", "title": "체크1"},
            {"category_code": "VENUE", "title": "체크2"},
        ]

        rows = _merge_checklist_rows(active, set(), draft)

        # sorted(active_categories) == ["MEETING", "VENUE"] — MEETING 항목이 먼저 나와야 한다.
        assert [r.category_code for r in rows] == ["MEETING", "VENUE"]


class TestTimelineRowFromDraft:
    def test_target_date_is_wedding_date_plus_scaled_offset(self):
        item = {"category_code": "VENUE", "title": "제목", "default_dday_offset_days": -30}
        row = _timeline_row_from_draft(
            date(2027, 5, 15), set(), date(2026, 8, 24), 1, item, scale_factor=1.0
        )
        assert row.target_date == date(2027, 4, 15)

    def test_scale_factor_actually_scales_negative_offset(self):
        # 2026-08-28 — LLM 경로도 카탈로그 경로(generate_timeline_items)와 동일하게 스케일된다.
        item = {"category_code": "VENUE", "title": "제목", "default_dday_offset_days": -30}
        row = _timeline_row_from_draft(
            date(2027, 5, 15), set(), date(2026, 8, 24), 1, item, scale_factor=0.5
        )
        assert row.target_date == date(2027, 5, 15) - timedelta(days=15)
        assert row.default_dday_offset_days == -15

    def test_origin_is_llm_and_not_date_overridden(self):
        item = {"category_code": "VENUE", "title": "제목", "default_dday_offset_days": 0}
        row = _timeline_row_from_draft(
            date(2027, 5, 15), set(), date(2026, 8, 24), 1, item, scale_factor=1.0
        )
        assert row.origin == "LLM"
        assert row.date_overridden is False

    def test_done_status_uses_raw_offset_not_scaled_offset(self):
        # done_so_far DONE 판정은 스케일 전(raw) target_date 기준 — 스케일된 target_date로는
        # 카탈로그 최솟값과 동일한 계산 성질 때문에 "이미 지남"이 절대 나올 수 없다(2026-08-28
        # 사용자 결정, app/services/timeline.py 모듈 docstring 참고).
        item = {"category_code": "VENUE", "title": "제목", "default_dday_offset_days": -300}
        # raw target_date = 2027-05-15 - 300일 = 2026-07-19, today(2026-08-24)보다 과거.
        row = _timeline_row_from_draft(
            date(2027, 5, 15), {"VENUE"}, date(2026, 8, 24), 1, item, scale_factor=0.5
        )
        assert row.status == "DONE"
        # 저장된 target_date 자체는 스케일된 값(offset=-150)이라 today보다 미래다.
        assert row.target_date == date(2027, 5, 15) - timedelta(days=150)


class TestTimelineFallbackRows:
    def test_delegates_to_generate_timeline_items_and_filters_by_active_categories(self):
        rows = _timeline_fallback_rows(date(2027, 5, 15), {"VENUE"}, None, date(2026, 8, 24))
        assert all(r.category_code in (None, "VENUE") for r in rows)
        assert not any(r.category_code == "SDM" for r in rows)

    def test_rows_have_catalog_fallback_origin(self):
        # 2026-08-28 신규 — 예전엔 이 클래스가 origin을 아예 검증하지 않았다(generate_
        # timeline_items가 "LLM"을 찍고 있었는데도). origin='LLM' mislabel 수정 후 실제로
        # "CATALOG_FALLBACK"이 나오는지 처음으로 확정한다.
        rows = _timeline_fallback_rows(date(2027, 5, 15), {"VENUE"}, None, date(2026, 8, 24))
        assert rows
        assert all(r.origin == "CATALOG_FALLBACK" for r in rows)


class TestTimelineProtectedClause:
    """2026-08-29 재생성 중복 항목 버그 — 타임라인 보호 기준이 "사용자가 완료를 체크했거나
    날짜를 바꾼 항목(+사용자가 직접 추가한 항목)"인지 SQL 수준에서 고정한다. 실제 행 필터링은
    라이브 DB에서 확인하는 이 레포 컨벤션대로(모듈 docstring), 여기서는 조건식이 조용히
    예전 기준(user_edited_at 단독)으로 되돌아가지 않는지를 회귀 방지로 잡는다."""

    def test_requires_done_or_date_overridden_not_just_user_edited_at(self):
        sql = _compiled_timeline_protected_sql()

        assert "user_edited_at IS NOT NULL" in sql
        assert "status = 'DONE'" in sql
        assert "date_overridden" in sql

    def test_user_added_rows_are_protected(self):
        # origin='USER' 행은 AI 생성물이 아니라 재생성 대상 자체가 아니다 — 예전 기준
        # (user_edited_at IS NULL)에서는 재생성 때마다 조용히 지워졌다.
        assert "origin = 'USER'" in _compiled_timeline_protected_sql()


class TestChecklistProtectedClause:
    """2026-08-29 2차 수정 — 체크리스트 재생성이 사실상 아무것도 안 바꾸던 버그. 보호 기준이
    "진행 흔적(status가 기본값이 아님)·메모·사용자 추가"인지 SQL 수준에서 고정한다. 타임라인
    클래스와 같은 이유로 실제 행 필터링은 라이브 DB에서 확인하고(모듈 docstring), 여기서는
    조건식이 조용히 예전 기준(user_edited_at 단독)으로 되돌아가지 않는지를 회귀 방지로 잡는다."""

    def test_does_not_protect_on_user_edited_at_alone(self):
        # 이게 이 버그의 핵심 — update_checklist_item이 PATCH 내용과 무관하게 찍는 컬럼이라
        # 상태를 다시 TODO로 되돌린 항목까지 영구 보호됐다.
        assert "user_edited_at" not in _compiled_checklist_protected_sql()

    def test_protects_rows_with_non_default_status_per_category(self):
        # HOMEWARE만 상태값 체계가 달라(04_DB_schema.sql CHECK) 기본값도 다르다 — 한쪽 기준으로
        # 뭉뚱그리면 HOMEWARE의 LISTED 행이 "진행 흔적 있음"으로 잘못 보호된다.
        sql = _compiled_checklist_protected_sql()

        assert "category_code = 'HOMEWARE'" in sql
        assert "status != 'LISTED'" in sql
        assert "category_code != 'HOMEWARE'" in sql
        assert "status != 'TODO'" in sql

    def test_protects_rows_with_memo(self):
        # 메모는 체크리스트에만 있는 편집 축(타임라인 조건에는 대응물이 없다). 빈 문자열은
        # "메모 없음"과 같이 본다 — 메모를 지운 PATCH가 ""로 올 수 있다.
        sql = _compiled_checklist_protected_sql()

        assert "memo IS NOT NULL" in sql
        assert "memo != ''" in sql

    def test_user_added_rows_are_protected(self):
        # 타임라인은 1차 수정에서 고쳤지만 체크리스트는 그대로였다 — create_checklist_item이
        # origin='USER'로 만들면서 user_edited_at은 NULL로 두므로 재생성 때마다 지워졌다.
        assert "origin = 'USER'" in _compiled_checklist_protected_sql()


class TestDropRowsCollidingWithProtected:
    """2026-08-29 재생성 중복 항목 버그의 두 번째 축 — 살아남는 보호 행과 같은 항목을 새로
    꽂지 않는다. 특히 BLOCKED/FAILED 카탈로그 폴백은 그래프의 dedup 단계를 안 거치므로
    이 지점이 유일한 방어선이다."""

    def _timeline_row(self, category_code: str | None, title: str) -> TimelineItem:
        return TimelineItem(
            category_code=category_code,
            origin="CATALOG_FALLBACK",
            status="TODO",
            title=title,
            target_date=date(2027, 5, 15),
        )

    def test_row_with_same_title_as_protected_is_dropped(self):
        protected = [{"id": "x", "category_code": "VENUE", "title": "예식장 계약금 입금"}]
        rows = [
            self._timeline_row("VENUE", "예식장 계약금 입금"),
            self._timeline_row("VENUE", "본식 리허설"),
        ]

        kept = _drop_rows_colliding_with_protected("TIMELINE", rows, protected)

        assert [r.title for r in kept] == ["본식 리허설"]

    def test_whitespace_and_punctuation_variants_count_as_duplicates(self):
        # 사용자 눈에는 같은 항목인데 원문 완전 일치가 아니라 예전엔 그대로 두 행이 됐다.
        protected = [{"id": "x", "category_code": "VENUE", "title": "예식장 계약금 입금"}]
        rows = [self._timeline_row("VENUE", "예식장계약금 입금!")]

        kept = _drop_rows_colliding_with_protected("TIMELINE", rows, protected)

        assert kept == []

    def test_same_title_in_other_category_is_kept(self):
        protected = [{"id": "x", "category_code": "VENUE", "title": "계약 확인"}]
        rows = [self._timeline_row("SDM", "계약 확인")]

        kept = _drop_rows_colliding_with_protected("TIMELINE", rows, protected)

        assert len(kept) == 1

    def test_universal_rows_with_null_category_are_compared_among_themselves(self):
        # category_code=null(혼인신고 등 범용 일정)도 보호 대상이 될 수 있다 — None끼리 비교된다.
        protected = [{"id": "x", "category_code": None, "title": "혼인신고"}]
        rows = [self._timeline_row(None, "혼인신고"), self._timeline_row(None, "본식")]

        kept = _drop_rows_colliding_with_protected("TIMELINE", rows, protected)

        assert [r.title for r in kept] == ["본식"]

    def test_no_protected_items_keeps_everything(self):
        rows = [self._timeline_row("VENUE", "A"), self._timeline_row("VENUE", "B")]

        kept = _drop_rows_colliding_with_protected("TIMELINE", rows, [])

        assert kept == rows

    def test_duplicates_within_the_same_batch_are_also_dropped(self):
        rows = [self._timeline_row("VENUE", "A"), self._timeline_row("VENUE", "A")]

        kept = _drop_rows_colliding_with_protected("TIMELINE", rows, [])

        assert len(kept) == 1

    def test_works_for_checklist_rows_too(self):
        # 폴백 카탈로그 중복은 체크리스트도 같은 결함이었다(사용자가 체크한 항목이 보호되고,
        # 폴백이 같은 카탈로그 항목을 한 번 더 꽂음).
        protected = [{"id": "x", "category_code": "VENUE", "title": "계약금 상한 확인"}]
        rows = [
            ChecklistItem(
                category_code="VENUE",
                origin="CATALOG_FALLBACK",
                status="LISTED",
                item_type="CONTRACT_TERM",
                group_label="계약 조건 확인",
                title="계약금 상한 확인",
            )
        ]

        kept = _drop_rows_colliding_with_protected("CHECKLIST", rows, protected)

        assert kept == []
