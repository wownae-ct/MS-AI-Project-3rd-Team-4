"""app/personalization/validation.py 4규칙 단위 테스트 —
13_personalization_router_agent_design.md §1-4."""

from app.personalization.validation import (
    deduplicate_titles,
    group_checklist_by_category,
    validate_checklist_by_category,
    validate_checklist_items,
    validate_personalization_draft,
    validate_timeline_by_category,
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
    def test_missing_active_category_fails_when_no_protected_items(self):
        # 이름에 "when_no_protected_items"를 넣은 이유: 2026-08-30 2차부터 protected도 커버로
        # 세므로, 이 명제는 "보호 항목도 없을 때"만 참이다(아래 짝 테스트 참고).
        active = {"VENUE", "SDM"}
        items = [{"category_code": "VENUE", "title": "제목"}]

        errors = validate_checklist_items(active, items)

        assert any("SDM" in e for e in errors)

    def test_category_covered_only_by_protected_items_passes(self):
        # 이번 수정의 SSOT — staging 실패(test05)의 최소 재현. 새 초안이 protected와 제목이
        # 전부 겹쳐 dedup으로 0건이 돼도, 그 보호 행은 재생성 후에도 화면에 남으므로
        # "항목이 없다"가 아니다.
        errors = validate_checklist_items({"VENUE"}, [], {("VENUE", "계약금 상한 확인")})

        assert errors == []

    def test_timeline_category_covered_only_by_protected_items_passes(self):
        errors = validate_timeline_items({"VENUE"}, [], {("VENUE", "예식장 투어 시작")})

        assert errors == []

    def test_protected_item_in_another_category_does_not_cover_missing_category(self):
        # 완화가 과도하게 새지 않는지 — VENUE 보호 항목이 SDM을 덮어주면 안 된다.
        errors = validate_checklist_items(
            {"VENUE", "SDM"},
            [{"category_code": "VENUE", "title": "제목"}],
            {("VENUE", "계약금 상한 확인")},
        )

        assert any("SDM" in e for e in errors)

    def test_protected_title_with_null_category_covers_nothing(self):
        # TIMELINE 범용 항목(category_code=None)은 어떤 활성 카테고리도 커버하지 못한다 —
        # 초안 쪽 `is not None` 필터와 대칭이어야 한다.
        errors = validate_timeline_items({"VENUE"}, [], {(None, "혼인신고")})

        assert any("VENUE" in e for e in errors)

    def test_protected_coverage_does_not_suppress_other_rules(self):
        # 완화가 커버리지 규칙만 건드리고 나머지 규칙(제목 누락 등)은 그대로 잡아야 한다.
        errors = validate_checklist_items(
            {"VENUE"}, [{"category_code": "VENUE"}], {("VENUE", "계약금 상한 확인")}
        )

        assert any("title" in e or "제목" in e for e in errors)

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

    def test_error_message_shows_original_title_not_normalized_key(self):
        # 이 문구는 retry_feedback으로 LLM에게 되돌아간다(prompts.py::_retry_feedback_note) —
        # 정규화 키("계약확인")를 보여주면 실제로 만든 제목과 글자가 달라 교정 지시가 어긋난다.
        items = [
            {"category_code": "VENUE", "title": "계약 확인"},
            {"category_code": "VENUE", "title": "계약  확인"},
        ]

        errors = validate_checklist_items({"VENUE"}, items)

        assert any("'계약  확인'" in e for e in errors)


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

    def test_title_differing_only_in_spacing_or_punctuation_is_a_duplicate(self):
        # 2026-08-29 재생성 중복 항목 버그 — 예전엔 원문 완전 일치만 중복으로 봐서 표기 차이
        # 하나로 사실상 같은 항목이 두 개 남았다(normalize_title 도입).
        first = {"category_code": "VENUE", "title": "예식장 계약금 입금"}
        variant = {"category_code": "VENUE", "title": "예식장계약금  입금!"}

        kept, dropped = deduplicate_titles([first, variant])

        assert kept == [first]
        assert dropped == [variant]

    def test_protected_title_matching_only_after_normalization_is_dropped(self):
        item = {"category_code": "VENUE", "title": "예식장 계약금  입금"}
        protected_titles = {("VENUE", "예식장계약금 입금")}

        kept, dropped = deduplicate_titles([item], protected_titles)

        assert kept == []
        assert dropped == [item]

    def test_kept_items_keep_their_original_titles(self):
        # 정규화는 판정 키에만 쓰고 저장/표시용 제목은 원문 그대로여야 한다.
        items = [{"category_code": "VENUE", "title": "예식장 계약금 입금"}]

        kept, _ = deduplicate_titles(items)

        assert kept[0]["title"] == "예식장 계약금 입금"

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


class TestGroupChecklistByCategory:
    def test_groups_items_by_category_code(self):
        items = [
            {"category_code": "VENUE", "title": "A"},
            {"category_code": "SDM", "title": "B"},
            {"category_code": "VENUE", "title": "C"},
        ]

        grouped = group_checklist_by_category(items)

        assert grouped == {
            "VENUE": [
                {"category_code": "VENUE", "title": "A"},
                {"category_code": "VENUE", "title": "C"},
            ],
            "SDM": [{"category_code": "SDM", "title": "B"}],
        }

    def test_empty_list_returns_empty_dict(self):
        assert group_checklist_by_category([]) == {}


class TestValidateChecklistByCategory:
    """2026-08-30 결정(red-bug.md #9-11) — CHECKLIST만 카테고리별 독립 SUCCESS/BLOCKED를
    낸다. #129 배포 이후에도 CHECKLIST가 활성 카테고리 일부만 커버하고 나머지를 스스로
    '다 했다'고 판단해 스킵하는 실패가 재발했다 — 그 실패를 도메인 전체가 아니라 카테고리
    단위로 국소화하는 게 이 함수의 존재 이유다."""

    def test_all_categories_covered_are_all_success(self):
        active = {"VENUE", "SDM"}
        items = [
            {"category_code": "VENUE", "title": "체크1"},
            {"category_code": "SDM", "title": "체크2"},
        ]

        status, errors = validate_checklist_by_category(active, items)

        assert status == {"VENUE": "SUCCESS", "SDM": "SUCCESS"}
        assert errors == {"VENUE": [], "SDM": []}

    def test_one_missing_category_only_blocks_that_category(self):
        # 이번 재발 버그의 핵심 재현 — VENUE만 만들고 SDM을 스스로 스킵한 LLM 응답.
        active = {"VENUE", "SDM"}
        items = [{"category_code": "VENUE", "title": "체크1"}]

        status, errors = validate_checklist_by_category(active, items)

        assert status == {"VENUE": "SUCCESS", "SDM": "BLOCKED"}
        assert errors["VENUE"] == []
        assert any("SDM" in e for e in errors["SDM"])

    def test_no_items_at_all_blocks_every_active_category(self):
        active = {"VENUE", "SDM", "GIFT"}

        status, _errors = validate_checklist_by_category(active, [])

        assert status == {"VENUE": "BLOCKED", "SDM": "BLOCKED", "GIFT": "BLOCKED"}

    def test_duplicate_title_only_blocks_its_own_category(self):
        # 규칙 (4)는 카테고리 내부에서만 성립하므로, 카테고리별로 나눠 검사해도 VENUE의
        # 중복이 SDM 판정에 새지 않아야 한다.
        active = {"VENUE", "SDM"}
        items = [
            {"category_code": "VENUE", "title": "계약 확인"},
            {"category_code": "VENUE", "title": "계약 확인"},
            {"category_code": "SDM", "title": "체크2"},
        ]

        status, _ = validate_checklist_by_category(active, items)

        assert status["VENUE"] == "BLOCKED"
        assert status["SDM"] == "SUCCESS"

    def test_item_with_invalid_category_code_does_not_affect_other_categories(self):
        # 오탈자("VENUe" 같은) 항목이 하나 섞여도, 그 항목은 어느 활성 카테고리에도 안
        # 묶이므로(group_checklist_by_category가 원문 그대로 키로 씀) VENUE/SDM 판정에는
        # 영향이 없다 — 이 항목 자체의 존재는 validate_checklist_items의 멤버십 규칙이
        # 별도로 잡아낸다(여기서는 카테고리별 커버리지만 확인).
        active = {"VENUE", "SDM"}
        items = [
            {"category_code": "VENUe", "title": "오탈자 항목"},
            {"category_code": "VENUE", "title": "체크1"},
            {"category_code": "SDM", "title": "체크2"},
        ]

        status, _ = validate_checklist_by_category(active, items)

        assert status == {"VENUE": "SUCCESS", "SDM": "SUCCESS"}


class TestValidateTimelineByCategory:
    """2026-08-30 2차 — TIMELINE도 CHECKLIST와 같은 카테고리 단위 판정을 낸다. staging에서
    보호 항목이 하나도 없는 계정(test1431)이 GIFT/HOMENEW/HOMEWARE/HONEYMOON 누락으로
    BLOCKED된 실패가 근거 — 도메인 단위 폴백이라 그 1개 때문에 나머지 카테고리의 LLM 결과까지
    전부 버려졌다."""

    def test_one_missing_category_only_blocks_that_category(self):
        items = [
            {"category_code": "VENUE", "title": "예식장 투어", "default_dday_offset_days": -300}
        ]

        status, _ = validate_timeline_by_category({"VENUE", "SDM"}, items)

        assert status == {"VENUE": "SUCCESS", "SDM": "BLOCKED"}

    def test_category_covered_only_by_protected_is_success(self):
        # 커버리지 완화가 카테고리 단위 판정 경로에도 실제로 전달되는지(전달 누락 회귀 방지).
        status, _ = validate_timeline_by_category(
            {"VENUE", "SDM"},
            [{"category_code": "SDM", "title": "드레스 투어", "default_dday_offset_days": -200}],
            {("VENUE", "예식장 투어 시작")},
        )

        assert status == {"VENUE": "SUCCESS", "SDM": "SUCCESS"}

    def test_offset_out_of_range_only_blocks_its_own_category(self):
        items = [
            {"category_code": "VENUE", "title": "예식장 투어", "default_dday_offset_days": -300},
            {"category_code": "SDM", "title": "드레스 투어", "default_dday_offset_days": -9999},
        ]

        status, _ = validate_timeline_by_category({"VENUE", "SDM"}, items)

        assert status == {"VENUE": "SUCCESS", "SDM": "BLOCKED"}
