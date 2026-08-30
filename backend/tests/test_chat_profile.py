"""app/rag/chat_profile.py::render_chat_profile_block 단위 테스트 — DB/LLM 없이 도는 순수
함수라 결정론적으로 검증할 수 있다(모듈 docstring이 그렇게 설계한 이유를 밝히고 있다).

가장 중요한 축은 red-bug.md #20(개인화 프롬프트가 raw snake_case 필드명과 ENUM 값을 유출해
답변 본문에 "venue_priority가 FOOD이므로..."가 찍힌 사고)의 **동형 재발 방지**다. 챗은 답변이
사용자에게 그대로 스트리밍되므로 같은 결함의 노출 확률이 개인화보다 크다."""

from datetime import date

from app.rag.chat_profile import (
    ChatProfile,
    ChatProfileCategory,
    render_chat_profile_block,
)

_VENUE = ChatProfileCategory(
    name_ko="예식장", planned_budget=20_000_000, paid_amount=12_000_000, remaining=8_000_000
)
_SDM = ChatProfileCategory(
    name_ko="스드메", planned_budget=5_000_000, paid_amount=0, remaining=5_000_000
)


def _profile(**overrides) -> ChatProfile:
    base = {
        "wedding_date": date(2027, 5, 14),
        "wedding_date_precision": "EXACT",
        "d_day": -256,
        "total_budget": 30_000_000,
        "total_budget_unsure": False,
        "guest_count": 200,
        "guest_count_unsure": False,
        "categories": (_VENUE, _SDM),
        "checklist_progress": 0.42,
        "timeline_progress": 0.27,
    }
    return ChatProfile(**{**base, **overrides})


class TestNoInternalIdentifierLeak:
    """red-bug.md #20 동형 재발 방지 — 이 파일에서 가장 중요한 테스트."""

    def test_block_contains_no_raw_enum_or_field_names(self):
        block = render_chat_profile_block(_profile())

        for forbidden in (
            "VENUE",
            "SDM",
            "EXACT",
            "total_budget",
            "planned_budget",
            "paid_amount",
            "category_code",
            "wedding_date_precision",
            "guest_count",
            "NO_PLAN",
        ):
            assert forbidden not in block, f"내부 식별자 {forbidden!r}가 프롬프트로 새어나감"

    def test_block_uses_korean_category_labels(self):
        block = render_chat_profile_block(_profile())

        assert "예식장" in block
        assert "스드메" in block


class TestNoMarkdown:
    def test_block_has_no_markdown_syntax(self):
        # 시스템 규칙 5번이 "볼드/번호목록 금지"인데 블록을 마크다운으로 주면 모델이 그대로
        # 모방한다(실사용자 불만으로 추가된 규칙이라 회귀 위험이 실재).
        block = render_chat_profile_block(_profile())

        for line in block.splitlines():
            stripped = line.strip()
            assert not stripped.startswith(("-", "*", "#", "1.", "2."))
        assert "**" not in block


class TestUncertainValuesAreNotStatedAsFact:
    def test_unsure_total_budget_is_labeled_as_provisional(self):
        # total_budget_unsure=True여도 컬럼은 NOT NULL — 값은 _resolve_total_budget()이 지역
        # 참가격 중간값으로 채운 placeholder다. 확정 예산인 것처럼 말하면 없는 사실이 된다.
        block = render_chat_profile_block(_profile(total_budget_unsure=True))

        assert "아직 정하지 않음" in block

    def test_non_exact_precision_does_not_assert_a_d_day(self):
        block = render_chat_profile_block(_profile(wedding_date_precision="APPROX_H1_NEXT_YEAR"))

        assert "내년 상반기" in block
        assert "D-" not in block and "D+" not in block

    def test_no_plan_precision_does_not_assert_a_d_day(self):
        # NO_PLAN의 wedding_date는 "오늘+18개월"이라 D-day가 완전히 무의미하다.
        block = render_chat_profile_block(_profile(wedding_date_precision="NO_PLAN"))

        assert "아직 시기를 정하지 않음" in block
        assert "D-" not in block and "D+" not in block

    def test_unsure_guest_count_is_omitted(self):
        block = render_chat_profile_block(_profile(guest_count_unsure=True))

        assert "하객" not in block

    def test_null_guest_count_is_omitted(self):
        block = render_chat_profile_block(_profile(guest_count=None))

        assert "하객" not in block


class TestEmptyAndMissingData:
    def test_no_active_categories_returns_none(self):
        # 블록 자체를 안 넣는다 — 빈 껍데기를 프롬프트에 넣으면 모델이 혼란스러워진다.
        assert render_chat_profile_block(_profile(categories=())) is None

    def test_missing_progress_omits_the_progress_line(self):
        block = render_chat_profile_block(_profile(checklist_progress=None, timeline_progress=None))

        assert "진행률" not in block

    def test_partial_progress_renders_only_available_domain(self):
        block = render_chat_profile_block(_profile(timeline_progress=None))

        assert "체크리스트" in block
        assert "타임라인" not in block


class TestBudgetRendering:
    def test_spend_and_remaining_are_included_per_category(self):
        # 이 기능의 대표 질문("남은 예산으로 스드메 가능할까?")이 성립하려면 지출·남음이
        # 반드시 있어야 한다 — 배정액만 주면 남은 예산을 계산할 수 없다.
        block = render_chat_profile_block(_profile())

        assert "배정" in block and "지출" in block and "남음" in block

    def test_amounts_are_pre_formatted_for_the_model(self):
        # LLM에게 자릿수 계산을 시키지 않는다(이 레포의 "계산은 코드가, LLM은 판단만" 관례).
        block = render_chat_profile_block(_profile())

        assert "3,000만원" in block
        assert "30000000" not in block
