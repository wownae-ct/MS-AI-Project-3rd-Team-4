"""app/services/vendor_case.py의 순수 부분 테스트(DB 세션이 필요한 list_vendor_cases는
라이브 DB가 있는 사용자 환경에서 확인 — 여기선 카테고리 상수/문구만 다룬다).

related_ds2_cases()는 실제 DB 쿼리(app/rag/retrieval.py::retrieve_ds2_kca_cases)를 거치지만,
그 함수 자체를 patch해 순수 매핑 로직(query_text 조립 + CitationOut 변환)만 DB 없이 검증한다
— app/rag/graph.py 테스트가 retrieve/verify_answer를 patch하는 것과 같은 패턴(2026-08-26,
F10-DS2 상호 링크)."""

from unittest.mock import AsyncMock, patch

from app.rag.retrieval import RetrievedChunk
from app.services.vendor_case import DISCLAIMER, FOCUS_CATEGORIES, related_ds2_cases


class TestFocusCategories:
    def test_only_venue_and_sdm(self):
        # F10은 카테고리 개수·ENUM 재설계와 무관하게 VENUE/SDM 2개로 고정
        # (06_RAG_implementation_and_copyright_review.md §3).
        assert FOCUS_CATEGORIES == {"VENUE", "SDM"}


class TestDisclaimer:
    def test_states_cases_are_reconstructed_not_real_vendors(self):
        assert "재구성" in DISCLAIMER
        assert "특정 업체를 지칭하지 않습니다" in DISCLAIMER


class TestRelatedDs2Cases:
    async def test_combines_situation_and_key_lesson_into_one_query(self):
        with patch(
            "app.services.vendor_case.retrieve_ds2_kca_cases", AsyncMock(return_value=[])
        ) as retrieve_mock:
            await related_ds2_cases(object(), "VENUE", "상황문장", "교훈문장")

        assert retrieve_mock.call_args.args[1] == "VENUE"
        assert retrieve_mock.call_args.args[2] == "상황문장 교훈문장"

    async def test_maps_retrieved_chunks_to_citation_out(self):
        chunk = RetrievedChunk(
            chunk_id=7,
            content="본문",
            title="DS2 분쟁조정 사례",
            source_tier="OFFICIAL",
            source_url="https://example.com/case",
        )
        with patch(
            "app.services.vendor_case.retrieve_ds2_kca_cases", AsyncMock(return_value=[chunk])
        ):
            result = await related_ds2_cases(object(), "SDM", "상황", "교훈")

        assert len(result) == 1
        assert result[0].chunk_id == 7
        assert result[0].title == "DS2 분쟁조정 사례"
        assert result[0].source_tier == "OFFICIAL"
        assert result[0].source_url == "https://example.com/case"

    async def test_no_match_returns_empty_list(self):
        # tsvector 겹치는 단어가 없으면 retrieve_ds2_kca_cases가 빈 리스트를 반환한다 —
        # 관련 없는 사례를 억지로 붙이지 않는다는 원칙이 그대로 전달되는지 확인.
        with patch("app.services.vendor_case.retrieve_ds2_kca_cases", AsyncMock(return_value=[])):
            result = await related_ds2_cases(object(), "VENUE", "상황", "교훈")

        assert result == []
