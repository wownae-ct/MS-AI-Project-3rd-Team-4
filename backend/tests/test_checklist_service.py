"""app/services/checklist.py 테스트 — 카테고리별 상태값 규칙(순수 함수)과 create_checklist_item.

create_checklist_item은 2026-09-01까지 테스트가 0건이었다(엔드포인트 스모크도 없었다). 인자
10개 중 8개가 str/str|None이고 호출부가 전부 위치 인자라, 인접한 group_label/title/body가
자리를 바꿔도 아무것도 잡아내지 못하는 상태였다 — ruff 기본 규칙셋(E4/E7/E9/F)에는 타입
검사가 없고 CI에 mypy도 pyright도 없다. 시그니처를 payload 하나로 압축하기 전에 필드별
매핑을 먼저 봉인한다.

DB는 tests/fakes.py의 인메모리 FakeSession으로 대체한다(공유 운영 DB를 건드리지 않는다)."""

import uuid

from fakes import FakeSession

from app.services.checklist import (
    create_checklist_item,
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


class TestCreateChecklistItem:
    """필드 매핑 특성화. 값을 전부 다르게 줘서 자리가 바뀌면 반드시 걸리게 한다."""

    async def _create(self, category_code: str = "VENUE") -> tuple:
        session = FakeSession()
        wedding_id = uuid.UUID("44444444-4444-4444-4444-444444444444")
        item = await create_checklist_item(
            session,
            wedding_id,
            category_code,
            "CONTRACT_TERM",
            "그룹라벨",
            "제목",
            "본문",
            "high",
            "옵션그룹",
            "태그",
        )
        return item, session, wedding_id

    async def test_every_argument_lands_on_its_own_column(self):
        item, _, wedding_id = await self._create()
        assert item.wedding_id == wedding_id
        assert item.category_code == "VENUE"
        assert item.item_type == "CONTRACT_TERM"
        assert item.group_label == "그룹라벨"
        assert item.title == "제목"
        assert item.body == "본문"
        assert item.priority == "high"
        assert item.option_group == "옵션그룹"
        assert item.tag == "태그"

    async def test_origin_is_server_decided_not_client_supplied(self):
        """origin은 payload에 없는 값이다 — 시그니처를 압축할 때 조용히 사라지기 쉽다."""
        item, _, _ = await self._create()
        assert item.origin == "USER"

    async def test_status_is_derived_from_category_not_passed_in(self):
        item, _, _ = await self._create("VENUE")
        assert item.status == "TODO"

    async def test_homeware_gets_purchase_stage_default_status(self):
        item, _, _ = await self._create("HOMEWARE")
        assert item.status == "LISTED"

    async def test_persists_exactly_once(self):
        _, session, _ = await self._create()
        assert session.op_names() == ["add", "commit", "refresh"]
