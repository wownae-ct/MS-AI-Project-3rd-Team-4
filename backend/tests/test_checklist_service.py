"""app/services/checklist.py의 순수 함수 테스트(DB 세션이 필요한 CRUD 함수는 라이브 DB가 있는
사용자 환경에서 확인 — 여기선 카테고리별 상태값 규칙만 다룬다)."""

from app.services.checklist import (
    default_status_for_category,
    is_valid_status_for_category,
    valid_statuses_for_category,
)


class TestValidStatusesForCategory:
    def test_homeware_uses_purchase_stage_statuses(self):
        assert valid_statuses_for_category("HOMEWARE") == {
            "LISTED",
            "COMPARING",
            "ORDERED",
            "DELIVERED",
        }

    def test_other_categories_use_general_statuses(self):
        for code in (
            "MEETING",
            "VENUE",
            "SDM",
            "GIFT",
            "INVITATION",
            "HONEYMOON",
            "HOMENEW",
            "ETC",
        ):
            assert valid_statuses_for_category(code) == {"TODO", "DOING", "SKIP", "DONE"}


class TestDefaultStatusForCategory:
    def test_homeware_defaults_to_listed(self):
        assert default_status_for_category("HOMEWARE") == "LISTED"

    def test_other_categories_default_to_todo(self):
        assert default_status_for_category("VENUE") == "TODO"


class TestIsValidStatusForCategory:
    def test_general_status_invalid_for_homeware(self):
        assert is_valid_status_for_category("HOMEWARE", "DOING") is False

    def test_homeware_status_invalid_for_general_category(self):
        assert is_valid_status_for_category("VENUE", "COMPARING") is False

    def test_matching_status_is_valid(self):
        assert is_valid_status_for_category("HOMEWARE", "ORDERED") is True
        assert is_valid_status_for_category("VENUE", "DONE") is True
