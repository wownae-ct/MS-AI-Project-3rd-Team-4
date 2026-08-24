"""app/rag/query_profile.py — 순수 함수만(DB/LLM/Langfuse 없이 도는 것).

needs_contract_term_bonus 회귀 케이스가 특히 중요하다 — app/rag/retrieval.py의 F9 검색 랭킹
가산점 판별을 여기로 이동한 것이라, 이동 과정에서 로직이 바뀌면 검색 결과 순위 자체가 조용히
달라진다."""

import json

from app.rag.query_profile import (
    TAG_CONTRACT_TERM,
    TAG_SHORT_QUERY,
    needs_contract_term_bonus,
    profile_query,
)


class TestProfileQuery:
    def test_two_token_keyword_query_is_short(self):
        profile = profile_query("위약금 비율")

        assert profile.token_count == 2
        assert TAG_SHORT_QUERY in profile.tags

    def test_three_token_query_is_short_boundary(self):
        profile = profile_query("웨딩홀 계약 시점")

        assert TAG_SHORT_QUERY in profile.tags

    def test_four_token_query_is_not_short(self):
        profile = profile_query("웨딩홀 계약은 보통 언제")

        assert TAG_SHORT_QUERY not in profile.tags

    def test_sentence_query_is_not_short(self):
        profile = profile_query("웨딩홀 계약은 보통 언제 하는 게 좋나요?")

        assert TAG_SHORT_QUERY not in profile.tags

    def test_contract_keyword_adds_contract_tag(self):
        profile = profile_query("위약금 비율")

        assert TAG_SHORT_QUERY in profile.tags
        assert TAG_CONTRACT_TERM in profile.tags

    def test_non_contract_short_query_has_only_short_tag(self):
        profile = profile_query("스드메 평균가")

        assert profile.tags == (TAG_SHORT_QUERY,)

    def test_long_contract_query_has_only_contract_tag(self):
        profile = profile_query("표준약관상 계약 해지 시 위약금은 어떻게 계산되나요")

        assert TAG_CONTRACT_TERM in profile.tags
        assert TAG_SHORT_QUERY not in profile.tags

    def test_extra_whitespace_does_not_inflate_token_count(self):
        profile = profile_query("  위약금   비율  ")

        assert profile.token_count == 2

    def test_empty_query_does_not_crash(self):
        profile = profile_query("")

        assert profile.token_count == 0
        assert profile.char_length == 0
        assert TAG_SHORT_QUERY in profile.tags

    def test_as_metadata_is_json_serializable(self):
        profile = profile_query("웨딩홀 계약 시점")

        metadata = profile.as_metadata()

        assert json.dumps(metadata)  # 예외 없이 직렬화되면 통과
        assert metadata == {"query_token_count": 3, "query_char_length": 9}


class TestNeedsContractTermBonus:
    """app/rag/retrieval.py의 F9 검색 가산점이 쓰던 판별 로직 — 이동 후에도 키워드 판정이
    그대로인지 잠그는 회귀 가드."""

    def test_matches_all_known_keywords(self):
        assert needs_contract_term_bonus("계약 문의드립니다") is True
        assert needs_contract_term_bonus("위약금이 얼마인가요") is True
        assert needs_contract_term_bonus("해지하고 싶어요") is True

    def test_does_not_match_unrelated_query(self):
        assert needs_contract_term_bonus("스드메 평균가 알려줘") is False
