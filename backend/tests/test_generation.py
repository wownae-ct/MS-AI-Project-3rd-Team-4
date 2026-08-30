"""app/rag/generation.py의 순수 로직(_normalize_verdict) — DB/LLM 없이 도는 것만.

red-bug.md #15 후속(2026-08-29) — Verdict Literal에 "OUT_OF_SCOPE"가 추가된 뒤에도
verify_node가 실제로 낼 수 있는 값은 SUPPORTED/WEAK/GENERAL 3종뿐이어야 한다는 것을 고정."""

from app.rag.generation import _normalize_verdict, build_chat_messages
from app.rag.retrieval import RetrievedChunk


class TestNormalizeVerdict:
    def test_passes_through_known_verdicts_unchanged(self):
        assert _normalize_verdict("SUPPORTED") == "SUPPORTED"
        assert _normalize_verdict("WEAK") == "WEAK"
        assert _normalize_verdict("GENERAL") == "GENERAL"

    def test_normalizes_unknown_verdict_to_general(self):
        assert _normalize_verdict("PARTIALLY_SUPPORTED") == "GENERAL"

    def test_normalizes_none_to_general(self):
        assert _normalize_verdict(None) == "GENERAL"

    def test_out_of_scope_is_not_a_valid_verify_node_output(self):
        # Verdict Literal(app/schemas/common.py)엔 "OUT_OF_SCOPE"가 있지만, 그건
        # app/rag/scope_check.py가 그래프 호출 전에 결정하는 값이지 verify_node의 출력이
        # 아니다 — LLM이 이 문자열을 그대로 흉내 내 냈다면 정상화 없이 통과시키면 안 된다.
        assert _normalize_verdict("OUT_OF_SCOPE") == "GENERAL"


_CHUNK = RetrievedChunk(
    chunk_id=1,
    content="예식장 계약금은 총액의 10%를 넘지 않아야 한다.",
    title="공정위 예식장 표준약관",
    source_tier="OFFICIAL",
    source_url="https://example.test/venue",
)
_PROFILE_BLOCK = "총 예산: 3,000만원\n카테고리별 배정 예산과 지출 현황:\n  예식장: 배정 2,000만원, 지출 1,200만원, 남음 800만원"


class TestBuildChatMessagesProfileBlock:
    """2026-08-31 — 프로필 주입. 가장 중요한 계약은 **프로필이 없으면 프롬프트가 이 기능 도입
    전과 바이트 단위로 같다**는 것이다(골든 질문 평가·기존 상담 무회귀)."""

    def test_without_profile_the_prompt_is_unchanged(self):
        # 기본값 호출과 명시적 None 호출이 완전히 같아야 한다 — 기존 호출부는 인자를 안 넘긴다.
        assert build_chat_messages("VENUE", [_CHUNK], "질문") == build_chat_messages(
            "VENUE", [_CHUNK], "질문", None
        )

    def test_without_profile_no_profile_section_appears(self):
        messages = build_chat_messages("VENUE", [_CHUNK], "질문")

        assert "[사용자 정보" not in messages[0]["content"]

    def test_profile_block_goes_into_the_system_message_not_the_user_message(self):
        # user 메시지의 "참고 자료" 옆에 붙이면 모델이 프로필을 검색 근거로 오인해 규칙 1번이
        # 흔들린다 — 관할 선언이 규칙과 같은 위치(system)에 있어야 한다.
        messages = build_chat_messages("VENUE", [_CHUNK], "질문", _PROFILE_BLOCK)

        assert "3,000만원" in messages[0]["content"]
        assert "3,000만원" not in messages[1]["content"]

    def test_grounding_rule_1_survives_profile_injection(self):
        # 프로필을 넣더라도 환각 방지 계약(규칙 1)은 그대로 남아 있어야 한다.
        messages = build_chat_messages("VENUE", [_CHUNK], "질문", _PROFILE_BLOCK)

        assert "확인된 근거가 없습니다" in messages[0]["content"]

    def test_profile_works_for_global_chat_without_category(self):
        messages = build_chat_messages(None, [_CHUNK], "질문", _PROFILE_BLOCK)

        assert "[사용자 정보" in messages[0]["content"]
