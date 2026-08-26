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
from app.rag.retrieval import RetrievedChunk

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


class TestContractCitationGrounding:
    """generate_node의 DS3(표준계약서) RAG grounding — 13_personalization_router_agent_design.md
    §1-3을 확장. LLM은 source_ref_id(정수)만 고르고, 실제 source_tier/label/url은
    _resolve_checklist_citations가 검색 결과에서 코드로 직접 채운다."""

    _CHUNK = RetrievedChunk(
        chunk_id=7,
        content="계약금은 예식비용의 10%를 초과할 수 없다.",
        title="공정위 예식장이용 표준약관(제10030호)",
        source_tier="OFFICIAL",
        source_url="https://example.com/venue-terms",
    )

    @pytest.mark.asyncio
    async def test_no_session_in_config_skips_retrieval_entirely(self):
        # 기존 테스트들(설정에 session이 없음)과의 하위호환 보장 — retrieve가 아예 호출되지
        # 않아야 한다(호출되면 실제 DB 세션이 없어 그 자체로 실패했을 것).
        client = _client_with_responses(_SUCCESS_DRAFT)
        with (
            patch("app.personalization.graph.get_azure_openai_client", return_value=client),
            patch("app.personalization.graph.retrieve", AsyncMock()) as mock_retrieve,
        ):
            graph = build_graph()
            await graph.ainvoke(_initial_state(), {"configurable": {"settings": _TEST_SETTINGS}})

        mock_retrieve.assert_not_called()

    @pytest.mark.asyncio
    async def test_matching_source_ref_id_resolves_to_real_citation(self):
        draft_with_ref = {
            "checklist_items": [
                {
                    "category_code": "VENUE",
                    "item_type": "CONTRACT_TERM",
                    "title": "계약금 10% 상한 확인",
                    "body": "본문",
                    "priority": "high",
                    "source_ref_id": 7,
                }
            ],
            # TIMELINE도 활성 카테고리(VENUE)를 커버해야 validate가 통과한다 — 비워두면
            # coverage 규칙 위반으로 BLOCKED→재시도가 걸려 이 테스트의 단일 mock 응답이
            # 고갈된다(_client_with_responses가 응답 1개만 큐잉함).
            "timeline_items": [
                {"category_code": "VENUE", "title": "웨딩홀 계약", "default_dday_offset_days": -300}
            ],
        }
        client = _client_with_responses(draft_with_ref)
        session = MagicMock()
        with (
            patch("app.personalization.graph.get_azure_openai_client", return_value=client),
            patch(
                "app.personalization.graph.retrieve", AsyncMock(return_value=[self._CHUNK])
            ) as mock_retrieve,
        ):
            graph = build_graph()
            result = await graph.ainvoke(
                _initial_state(),
                {"configurable": {"settings": _TEST_SETTINGS, "session": session}},
            )

        mock_retrieve.assert_awaited_once()
        item = result["checklist_draft"][0]
        assert item["source_tier"] == "OFFICIAL"
        assert item["source_label"] == "공정위 예식장이용 표준약관(제10030호)"
        assert item["source_url"] == "https://example.com/venue-terms"
        assert "source_ref_id" not in item

    @pytest.mark.asyncio
    async def test_unmatched_source_ref_id_leaves_citation_fields_absent(self):
        draft_with_bad_ref = {
            "checklist_items": [
                {
                    "category_code": "VENUE",
                    "item_type": "CONTRACT_TERM",
                    "title": "확인 항목",
                    "body": "본문",
                    "priority": "mid",
                    "source_ref_id": 999,
                }
            ],
            "timeline_items": [
                {"category_code": "VENUE", "title": "웨딩홀 계약", "default_dday_offset_days": -300}
            ],
        }
        client = _client_with_responses(draft_with_bad_ref)
        session = MagicMock()
        with (
            patch("app.personalization.graph.get_azure_openai_client", return_value=client),
            patch("app.personalization.graph.retrieve", AsyncMock(return_value=[self._CHUNK])),
        ):
            graph = build_graph()
            result = await graph.ainvoke(
                _initial_state(),
                {"configurable": {"settings": _TEST_SETTINGS, "session": session}},
            )

        item = result["checklist_draft"][0]
        assert "source_tier" not in item
        assert "source_ref_id" not in item

    @pytest.mark.asyncio
    async def test_no_focus_category_active_skips_retrieval(self):
        # active_categories에 VENUE/SDM이 하나도 없으면(예: MEETING만) 검색 자체를 하지 않는다
        # — 근거를 달아줄 DS3 코퍼스가 애초에 그 카테고리를 커버하지 않으므로.
        state = _initial_state()
        state["profile"] = {"active_categories": ["MEETING"]}
        meeting_draft = {
            "checklist_items": [
                {
                    "category_code": "MEETING",
                    "item_type": "PREP",
                    "title": "상견례 장소 예약",
                    "body": "본문",
                    "priority": "mid",
                }
            ],
            "timeline_items": [
                {
                    "category_code": "MEETING",
                    "title": "상견례 진행",
                    "default_dday_offset_days": -200,
                }
            ],
        }
        client = _client_with_responses(meeting_draft)
        session = MagicMock()
        with (
            patch("app.personalization.graph.get_azure_openai_client", return_value=client),
            patch("app.personalization.graph.retrieve", AsyncMock()) as mock_retrieve,
        ):
            graph = build_graph()
            await graph.ainvoke(
                state, {"configurable": {"settings": _TEST_SETTINGS, "session": session}}
            )

        mock_retrieve.assert_not_called()
