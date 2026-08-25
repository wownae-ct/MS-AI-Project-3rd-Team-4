"""app/personalization/graph.py의 validate→generate 조건부 재시도(최대 1회) — 2026-08-25
결정. Azure OpenAI 클라이언트 모킹은 test_chat_graph.py가 세운 선례를 따른다(MagicMock +
AsyncMock(chat.completions.create)) — ONBOARDING_INITIAL 트리거를 쓰면 route 노드가 LLM을
아예 안 불러서(§1-2) generate 호출 횟수만으로 재시도 여부를 정확히 셀 수 있다."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.config import Settings
from app.personalization.graph import build_graph

_TEST_SETTINGS = Settings(
    database_url="postgresql://test",
    azure_openai_endpoint="https://test.openai.azure.com",
    google_client_id="test",
    google_client_secret="test",
    naver_client_id="test",
    naver_client_secret="test",
    azure_storage_blob_endpoint="https://test.blob.core.windows.net",
)

_BLOCKED_DRAFT = {"checklist_items": [], "timeline_items": []}
_SUCCESS_DRAFT = {
    "checklist_items": [
        {
            "category_code": "VENUE",
            "item_type": "PREP",
            "title": "웨딩홀 계약서 확인",
            "body": "본문",
            "priority": "mid",
        }
    ],
    "timeline_items": [
        {"category_code": "VENUE", "title": "웨딩홀 계약", "default_dday_offset_days": -300}
    ],
}


def _client_with_responses(*payloads: dict) -> MagicMock:
    responses = [
        SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(p)))])
        for p in payloads
    ]
    client = MagicMock()
    client.chat.completions.create = AsyncMock(side_effect=responses)
    return client


def _initial_state() -> dict:
    return {
        "wedding_id": "w1",
        "trigger": "ONBOARDING_INITIAL",
        "changed_fields": [],
        "profile": {"active_categories": ["VENUE"]},
        "protected_items": {"CHECKLIST": [], "TIMELINE": []},
        "requested_domains": [],
        "affected_domains": [],
        "route_reasoning": "",
        "checklist_draft": None,
        "timeline_draft": None,
        "validation_status": {},
        "validation_errors": {},
        "retry_count": 0,
    }


class TestValidateGenerateRetry:
    @pytest.mark.asyncio
    async def test_blocked_then_success_retries_exactly_once(self):
        client = _client_with_responses(_BLOCKED_DRAFT, _SUCCESS_DRAFT)
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(
                _initial_state(), {"configurable": {"settings": _TEST_SETTINGS}}
            )

        assert client.chat.completions.create.call_count == 2
        assert result["validation_status"] == {"CHECKLIST": "SUCCESS", "TIMELINE": "SUCCESS"}
        assert result["retry_count"] == 1

    @pytest.mark.asyncio
    async def test_retry_feedback_is_injected_into_second_prompt(self):
        client = _client_with_responses(_BLOCKED_DRAFT, _SUCCESS_DRAFT)
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            await graph.ainvoke(_initial_state(), {"configurable": {"settings": _TEST_SETTINGS}})

        first_prompt = client.chat.completions.create.call_args_list[0].kwargs["messages"][0][
            "content"
        ]
        second_prompt = client.chat.completions.create.call_args_list[1].kwargs["messages"][0][
            "content"
        ]
        assert "[재시도]" not in first_prompt
        assert "[재시도]" in second_prompt
        assert "활성 카테고리 VENUE에 생성된 항목이 없습니다" in second_prompt

    @pytest.mark.asyncio
    async def test_still_blocked_after_one_retry_stops_instead_of_looping(self):
        # 재시도 상한(1회) 회귀 방지 — 두 번째도 BLOCKED이면 generate를 세 번째로 또 부르지
        # 않고 그래프가 종료돼야 한다(app/services/personalization.py가 카탈로그 폴백 처리).
        client = _client_with_responses(_BLOCKED_DRAFT, _BLOCKED_DRAFT)
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(
                _initial_state(), {"configurable": {"settings": _TEST_SETTINGS}}
            )

        assert client.chat.completions.create.call_count == 2
        assert result["validation_status"] == {"CHECKLIST": "BLOCKED", "TIMELINE": "BLOCKED"}

    @pytest.mark.asyncio
    async def test_success_on_first_try_never_retries(self):
        client = _client_with_responses(_SUCCESS_DRAFT)
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(
                _initial_state(), {"configurable": {"settings": _TEST_SETTINGS}}
            )

        assert client.chat.completions.create.call_count == 1
        assert result["retry_count"] == 0
