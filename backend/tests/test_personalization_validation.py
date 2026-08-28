"""app/personalization/validation.py 4규칙 단위 테스트 —
13_personalization_router_agent_design.md §1-4."""

from app.personalization.validation import (
    deduplicate_titles,
    validate_checklist_items,
    validate_personalization_draft,
    validate_timeline_items,
)


class TestCategoryMembership:
    def test_category_not_in_active_categories_fails(self):
        # Arrange
        active = {"VENUE"}
        items = [{"category_code": "SDM", "title": "제목"}]

        # Act
        errors = validate_checklist_items(active, items)

        # Assert
        assert any("SDM" in e for e in errors)

    def test_category_in_active_categories_passes_membership_rule(self):
        active = {"VENUE"}
        items = [{"category_code": "VENUE", "title": "제목"}]

        errors = validate_checklist_items(active, items)

        assert not errors

    def test_timeline_universal_item_with_null_category_is_exempt(self):
        active = {"VENUE"}
        items = [
            {"category_code": None, "title": "혼인신고", "default_dday_offset_days": -7},
            {"category_code": "VENUE", "title": "예식장 계약", "default_dday_offset_days": -300},
        ]

        errors = validate_timeline_items(active, items)

        assert not errors

    def test_checklist_item_with_null_category_fails(self):
        # STEP 3 — 체크리스트엔 타임라인의 "범용 일정" 개념이 없다. 예전엔 이 값이 그냥
        # 통과했고, 이후 row 생성 단계가 조용히 필터링해 항목이 로그 없이 사라졌다.
        active = {"VENUE"}
        items = [{"category_code": None, "title": "제목"}]

        errors = validate_checklist_items(active, items)

        assert any("category_code" in e for e in errors)


class TestCategoryCoverage:
    def test_missing_active_category_fails(self):
        active = {"VENUE", "SDM"}
        items = [{"category_code": "VENUE", "title": "제목"}]

        errors = validate_checklist_items(active, items)

        assert any("SDM" in e for e in errors)

    def test_domain_independence_checklist_covers_but_timeline_missing_only_fails_timeline(self):
        # Arrange: 체크리스트엔 활성 카테고리 SDM 항목이 있고 타임라인엔 없음
        active_categories = {"VENUE", "SDM"}
        checklist_draft = [
            {"category_code": "VENUE", "title": "체크1"},
            {"category_code": "SDM", "title": "체크2"},
        ]
        timeline_draft = [
            {"category_code": "VENUE", "title": "타임1", "default_dday_offset_days": -300}
        ]

        # Act
        result = validate_personalization_draft(
            active_categories, ["CHECKLIST", "TIMELINE"], checklist_draft, timeline_draft
        )

        # Assert: 반환값 자체가 도메인별로 분리돼 있어야 한다(2026-08-24 버그 회귀 방지) — TIMELINE
        # 키에만 에러가 있고, CHECKLIST 키는 빈 리스트여야 한다. 호출자가 이걸 flat list로 합쳐서
        # "하나라도 있으면 전부 BLOCKED" 판단을 할 수 없는 구조라는 게 이 테스트의 핵심.
        assert any("SDM" in e for e in result["TIMELINE"])
        assert result["CHECKLIST"] == []


class TestDdayOffsetRange:
    def test_offset_within_range_passes(self):
        items = [{"category_code": "VENUE", "title": "제목", "default_dday_offset_days": -400}]

        errors = validate_timeline_items({"VENUE"}, items)

        assert not errors

    def test_offset_out_of_range_fails(self):
        items = [{"category_code": "VENUE", "title": "제목", "default_dday_offset_days": -401}]

        errors = validate_timeline_items({"VENUE"}, items)

        assert any("default_dday_offset_days" in e for e in errors)

    def test_offset_above_max_fails(self):
        items = [{"category_code": "VENUE", "title": "제목", "default_dday_offset_days": 61}]

        errors = validate_timeline_items({"VENUE"}, items)

        assert any("default_dday_offset_days" in e for e in errors)


class TestNoDuplicateTitles:
    def test_duplicate_title_within_same_category_fails(self):
        items = [
            {"category_code": "VENUE", "title": "계약 확인"},
            {"category_code": "VENUE", "title": "계약 확인"},
        ]

        errors = validate_checklist_items({"VENUE"}, items)

        assert any("계약 확인" in e for e in errors)

    def test_same_title_in_different_categories_passes(self):
        items = [
            {"category_code": "VENUE", "title": "계약 확인"},
            {"category_code": "SDM", "title": "계약 확인"},
        ]

        errors = validate_checklist_items({"VENUE", "SDM"}, items)

        assert not errors


class TestDeduplicateTitles:
    """2026-08-28 결정(red-bug.md #9-2) — 제목 중복은 도메인 전체를 BLOCKED시키지 않고,
    뒤에 나온 중복 항목만 드롭한다."""

    def test_keeps_first_drops_later_duplicate(self):
        first = {"category_code": "VENUE", "title": "예식장 투어 시작"}
        duplicate = {"category_code": "VENUE", "title": "예식장 투어 시작"}
        other = {"category_code": "VENUE", "title": "계약금 확인"}

        kept, dropped = deduplicate_titles([first, duplicate, other])

        assert kept == [first, other]
        assert dropped == [duplicate]

    def test_same_title_in_different_category_is_not_a_duplicate(self):
        items = [
            {"category_code": "VENUE", "title": "계약 확인"},
            {"category_code": "SDM", "title": "계약 확인"},
        ]

        kept, dropped = deduplicate_titles(items)

        assert kept == items
        assert dropped == []

    def test_no_duplicates_drops_nothing(self):
        items = [{"category_code": "VENUE", "title": "A"}]

        kept, dropped = deduplicate_titles(items)

        assert kept == items
        assert dropped == []

    def test_item_colliding_with_protected_title_is_dropped(self):
        # protected_titles(사용자가 이미 수정한 기존 행)와 겹치는 새 항목도 같은 이유로 드롭
        # 대상이다 — "다시 만들지 마세요" 지시를 LLM이 못 지켰다고 나머지까지 버릴 이유는 없다.
        item = {"category_code": "VENUE", "title": "계약 확인"}
        protected_titles = {("VENUE", "계약 확인")}

        kept, dropped = deduplicate_titles([item], protected_titles)

        assert kept == []
        assert dropped == [item]

    def test_deduped_output_passes_no_duplicate_titles_rule(self):
        # dedup 결과를 그대로 validate에 넘기면 규칙(4) 위반이 더 이상 안 걸려야 한다 —
        # graph.py::validate_node가 실제로 이 순서(dedup → validate)로 호출한다.
        items = [
            {"category_code": "VENUE", "title": "A"},
            {"category_code": "VENUE", "title": "A"},
        ]

        kept, _ = deduplicate_titles(items)
        errors = validate_checklist_items({"VENUE"}, kept)

        assert not any("제목 중복" in e for e in errors)


class TestValidatePersonalizationDraft:
    def test_only_affected_domains_are_validated(self):
        # Arrange: route가 CHECKLIST만 골랐다면 TIMELINE 초안이 비활성 카테고리를 포함해도
        # (혹은 아예 비어있어도) 이번 실행의 검증 대상이 아니다.
        active_categories = {"VENUE"}
        checklist_draft = [{"category_code": "VENUE", "title": "체크1"}]
        timeline_draft = None

        result = validate_personalization_draft(
            active_categories, ["CHECKLIST"], checklist_draft, timeline_draft
        )

        # affected_domains에 없는 TIMELINE은 반환값에 키 자체가 없어야 한다.
        assert result == {"CHECKLIST": []}
        assert "TIMELINE" not in result

    def test_success_case_with_both_domains(self):
        active_categories = {"VENUE", "SDM"}
        checklist_draft = [
            {"category_code": "VENUE", "title": "체크1"},
            {"category_code": "SDM", "title": "체크2"},
        ]
        timeline_draft = [
            {"category_code": "VENUE", "title": "타임1", "default_dday_offset_days": -300},
            {"category_code": "SDM", "title": "타임2", "default_dday_offset_days": -270},
        ]

        result = validate_personalization_draft(
            active_categories, ["CHECKLIST", "TIMELINE"], checklist_draft, timeline_draft
        )

        assert result == {"CHECKLIST": [], "TIMELINE": []}
