"""scripts/seed_vendor_cases.py의 정적 데이터가 06_RAG_implementation_and_copyright_review.md
§3 명예훼손 리스크 체크리스트의 구조적으로 검증 가능한 부분(실명 없음/카테고리·타입 유효성/
행동지침형 문구)을 계속 지키는지 회귀 테스트한다. "2개 이상 사례 합성"처럼 사람 판단이 필요한
항목은 여기서 검증할 수 없다 — docs/wedding/ing/f10-seed-data-prep.md의 source_note 검토로
이미 확인됨."""

from scripts.seed_vendor_cases import VENDOR_CASE_ROWS, collect_rows


class TestCollectRows:
    def test_returns_exactly_four_rows(self):
        assert len(collect_rows()) == 4

    def test_ids_are_unique_and_fixed_1_to_4(self):
        assert sorted(row.id for row in VENDOR_CASE_ROWS) == [1, 2, 3, 4]

    def test_covers_both_focus_categories_with_good_and_bad_each(self):
        pairs = {(row.category_code, row.case_type) for row in VENDOR_CASE_ROWS}
        assert pairs == {
            ("VENUE", "GOOD"),
            ("VENUE", "BAD"),
            ("SDM", "GOOD"),
            ("SDM", "BAD"),
        }

    def test_no_row_names_a_real_vendor(self):
        # §3-1 실명 금지 — case_label이 "A업체"/"한 예식장" 같은 익명 라벨인지 최소한의 신호로
        # 검사한다(고유명사 완전 탐지는 불가능하므로, 최소한 흔한 브랜드성 접미사는 걸러낸다).
        banned_suffixes = ("웨딩홀", "웨딩컨벤션", "스튜디오점")
        for row in VENDOR_CASE_ROWS:
            assert not row.case_label.endswith(banned_suffixes)

    def test_key_lesson_is_action_guidance_not_vendor_blame(self):
        # §3 체크리스트: "이 업체가 나쁘다"가 아니라 행동지침형이어야 한다 — 최소 신호로
        # 업체를 직접 비난하는 표현이 없는지만 확인한다.
        for row in VENDOR_CASE_ROWS:
            assert "나쁘다" not in row.key_lesson
            assert "사기" not in row.key_lesson

    def test_bad_cases_carry_a_source_note_grounding_them(self):
        # §3-4: BAD는 완전 창작이 아니라 실제 존재하는 패턴 근거가 있어야 한다.
        for row in VENDOR_CASE_ROWS:
            if row.case_type == "BAD":
                assert row.source_note.strip() != ""

    def test_all_text_fields_are_non_empty(self):
        for row in VENDOR_CASE_ROWS:
            assert row.case_label.strip()
            assert row.situation.strip()
            assert row.key_lesson.strip()
            assert row.source_note.strip()
