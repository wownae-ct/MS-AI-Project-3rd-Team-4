"""app/rag/generation.py의 순수 로직(_normalize_verdict) — DB/LLM 없이 도는 것만.

red-bug.md #15 후속(2026-08-29) — Verdict Literal에 "OUT_OF_SCOPE"가 추가된 뒤에도
verify_node가 실제로 낼 수 있는 값은 SUPPORTED/WEAK/GENERAL 3종뿐이어야 한다는 것을 고정."""

from app.rag.generation import _normalize_verdict


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
