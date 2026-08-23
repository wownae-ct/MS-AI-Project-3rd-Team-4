"""app/services/vendor_case.py의 순수 부분 테스트(DB 세션이 필요한 list_vendor_cases는
라이브 DB가 있는 사용자 환경에서 확인 — 여기선 카테고리 상수/문구만 다룬다)."""

from app.services.vendor_case import DISCLAIMER, FOCUS_CATEGORIES


class TestFocusCategories:
    def test_only_venue_and_sdm(self):
        # F10은 카테고리 개수·ENUM 재설계와 무관하게 VENUE/SDM 2개로 고정
        # (06_RAG_implementation_and_copyright_review.md §3).
        assert FOCUS_CATEGORIES == {"VENUE", "SDM"}


class TestDisclaimer:
    def test_states_cases_are_reconstructed_not_real_vendors(self):
        assert "재구성" in DISCLAIMER
        assert "특정 업체를 지칭하지 않습니다" in DISCLAIMER
