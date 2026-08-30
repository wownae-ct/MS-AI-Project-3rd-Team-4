"""app/personalization/graph.py의 (1) validate→generate 조건부 재시도(최대 1회, 2026-08-25
결정) + (2) 분리 호출(asyncio.gather, 2026-08-29 결정 red-bug.md #9 §9-6~§9-10) 회귀 테스트.

Azure OpenAI 클라이언트 모킹은 test_chat_graph.py가 세운 선례(MagicMock +
AsyncMock(chat.completions.create))를 따르되, generate_node가 이제 두 도메인을 asyncio.gather로
동시 호출하므로(콜 "순서"를 보장할 수 없음) 응답을 콜 순서가 아니라 프롬프트 안의 출력 스키마
마커("checklist_items" 단독 vs "timeline_items" 단독)로 매칭해 반환한다 —
`_client_with_domain_responses` 참고. ONBOARDING_INITIAL 트리거를 쓰면 route 노드가 LLM을
아예 안 불러서(§1-2) generate 호출 횟수만으로 재시도/분리 호출 여부를 정확히 셀 수 있다."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.categories import CATEGORY_META_BY_CODE
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

_BLOCKED_CHECKLIST = {"checklist_items": []}
_BLOCKED_TIMELINE = {"timeline_items": []}
_SUCCESS_CHECKLIST = {
    "checklist_items": [
        {
            "category_code": "VENUE",
            "item_type": "PREP",
            "title": "웨딩홀 계약서 확인",
            "body": "본문",
            "priority": "mid",
        }
    ]
}
_SUCCESS_TIMELINE = {
    "timeline_items": [
        {"category_code": "VENUE", "title": "웨딩홀 계약", "default_dday_offset_days": -300}
    ]
}
# TIMELINE은 도메인 단위 그대로라(2026-08-30 결정 참고) 활성 카테고리 전부를 한 응답에
# 커버해야 SUCCESS다 — TestChecklistCategoryFanOut의 active_categories=["VENUE","SDM"]
# 테스트는 위 VENUE 단독 페이로드로는 TIMELINE 자체가 BLOCKED돼 버려 CHECKLIST 재시도
# 회귀 검증이 흐려진다(TIMELINE도 같이 재호출됨).
_SUCCESS_TIMELINE_VENUE_SDM = {
    "timeline_items": [
        {"category_code": "VENUE", "title": "웨딩홀 계약", "default_dday_offset_days": -300},
        {"category_code": "SDM", "title": "드레스 투어", "default_dday_offset_days": -200},
    ]
}


def _client_with_domain_responses(
    checklist_payloads: list[dict] | None = None,
    timeline_payloads: list[dict] | None = None,
) -> MagicMock:
    """asyncio.gather로 두 콜이 동시에 나갈 수 있어 콜 "순서"로 어느 도메인 응답인지 정할 수
    없다 — 프롬프트 안의 출력 스키마 마커(build_generate_prompt가 단일 도메인 리스트로 조립하는
    "checklist_items"/"timeline_items" 단독 요청 문구)로 도메인을 판별해 그 도메인 큐의 다음
    응답을 반환한다. 큐가 비었는데 그 도메인이 또 호출되면(예상보다 콜이 많음) pop(0)이
    IndexError를 내며 테스트가 실패한다 — 콜 횟수 회귀를 자연히 잡아낸다."""
    checklist_queue = list(checklist_payloads or [])
    timeline_queue = list(timeline_payloads or [])

    async def _side_effect(*args, **kwargs):
        prompt = kwargs["messages"][0]["content"]
        is_checklist = "checklist_items" in prompt and "timeline_items" not in prompt
        is_timeline = "timeline_items" in prompt and "checklist_items" not in prompt
        assert is_checklist or is_timeline, f"prompt matched neither domain marker: {prompt[:200]}"
        payload = checklist_queue.pop(0) if is_checklist else timeline_queue.pop(0)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))]
        )

    client = MagicMock()
    client.chat.completions.create = AsyncMock(side_effect=_side_effect)
    return client


def _prompts_by_domain(client: MagicMock) -> tuple[list[str], list[str]]:
    """호출된 전체 프롬프트를 (checklist 프롬프트들, timeline 프롬프트들)로 나눠 반환 — 순서에
    의존하지 않고 도메인별로 검사할 때 쓴다."""
    checklist_prompts, timeline_prompts = [], []
    for call in client.chat.completions.create.call_args_list:
        prompt = call.kwargs["messages"][0]["content"]
        if "checklist_items" in prompt and "timeline_items" not in prompt:
            checklist_prompts.append(prompt)
        else:
            timeline_prompts.append(prompt)
    return checklist_prompts, timeline_prompts


def _client_with_checklist_categories_and_timeline(
    checklist_by_category: dict[str, list[dict]],
    timeline_payloads: list[dict] | None = None,
) -> MagicMock:
    """2026-08-30 결정(red-bug.md #9-11) 전용 — CHECKLIST가 이제 도메인 단위가 아니라
    카테고리 단위로 독립 호출되므로, 도메인 마커만으로는(위 `_client_with_domain_responses`)
    "어느 카테고리 호출인지"를 구분할 수 없다. `_generate_checklist_category_draft`가
    `profile["active_categories"]`를 그 카테고리 하나짜리 리스트로 좁혀 넘기고,
    `build_generate_prompt`가 그걸 raw ENUM이 아니라 한글 이름으로
    `"활성 카테고리: {한글명}"` 한 줄로 렌더링하므로(red-bug.md #20 유출 수정,
    `_describe_priorities_and_categories`) 그 줄로 카테고리를 판별한다. TIMELINE은
    기존과 동일하게 도메인 단위 그대로다. `client.call_log`에 호출 순서대로 매칭된
    카테고리/도메인 이름을 남겨, 어느 카테고리가 몇 번 불렸는지 그대로 검사할 수 있게 한다."""
    checklist_queues = {
        category: list(payloads) for category, payloads in checklist_by_category.items()
    }
    timeline_queue = list(timeline_payloads or [])
    call_log: list[str] = []

    def _marker(category: str) -> str:
        return f"활성 카테고리: {CATEGORY_META_BY_CODE[category].name_ko}"

    async def _side_effect(*args, **kwargs):
        prompt = kwargs["messages"][0]["content"]
        if "timeline_items" in prompt and "checklist_items" not in prompt:
            call_log.append("TIMELINE")
            payload = timeline_queue.pop(0)
        else:
            matched = next(category for category in checklist_queues if _marker(category) in prompt)
            call_log.append(matched)
            payload = checklist_queues[matched].pop(0)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))]
        )

    client = MagicMock()
    client.chat.completions.create = AsyncMock(side_effect=_side_effect)
    client.call_log = call_log
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


class TestSplitDomainCalls:
    """2026-08-29 결정(red-bug.md #9 §9-6~§9-10) — 두 도메인이 모두 대상이면 결합 단일 호출이
    아니라 도메인별 독립 호출을 asyncio.gather로 동시에 보낸다."""

    @pytest.mark.asyncio
    async def test_both_domains_succeed_on_first_try_makes_two_independent_calls(self):
        client = _client_with_domain_responses(
            checklist_payloads=[_SUCCESS_CHECKLIST], timeline_payloads=[_SUCCESS_TIMELINE]
        )
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(
                _initial_state(), {"configurable": {"settings": _TEST_SETTINGS}}
            )

        # 결합 1콜이 아니라 도메인별 2콜 — 분리 호출 전환의 핵심 회귀 지점.
        assert client.chat.completions.create.call_count == 2
        assert result["validation_status"] == {"CHECKLIST": "SUCCESS", "TIMELINE": "SUCCESS"}
        assert result["retry_count"] == 0

    @pytest.mark.asyncio
    async def test_single_affected_domain_still_makes_exactly_one_call(self):
        # FIELD_UPDATED가 한쪽 도메인만 골랐을 때(오늘도 이미 사실상 "분리 호출 1개")는 동작이
        # 안 바뀌어야 한다 — 향후 리팩터가 실수로 항상 gather하게 바꾸는 걸 잡는 회귀 테스트.
        state = _initial_state()
        state["trigger"] = "MANUAL_REGENERATE"
        state["requested_domains"] = ["CHECKLIST"]
        client = _client_with_domain_responses(checklist_payloads=[_SUCCESS_CHECKLIST])
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(state, {"configurable": {"settings": _TEST_SETTINGS}})

        assert client.chat.completions.create.call_count == 1
        assert result["validation_status"] == {"CHECKLIST": "SUCCESS"}
        assert result["timeline_draft"] is None


class TestValidateGenerateRetry:
    @pytest.mark.asyncio
    async def test_blocked_then_success_retries_exactly_once(self):
        # 1라운드(2콜, 둘 다 BLOCKED) + 재시도(2콜, 둘 다 SUCCESS) = 총 4콜.
        client = _client_with_domain_responses(
            checklist_payloads=[_BLOCKED_CHECKLIST, _SUCCESS_CHECKLIST],
            timeline_payloads=[_BLOCKED_TIMELINE, _SUCCESS_TIMELINE],
        )
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(
                _initial_state(), {"configurable": {"settings": _TEST_SETTINGS}}
            )

        assert client.chat.completions.create.call_count == 4
        assert result["validation_status"] == {"CHECKLIST": "SUCCESS", "TIMELINE": "SUCCESS"}
        assert result["retry_count"] == 1

    @pytest.mark.asyncio
    async def test_retry_feedback_is_injected_into_second_prompt(self):
        client = _client_with_domain_responses(
            checklist_payloads=[_BLOCKED_CHECKLIST, _SUCCESS_CHECKLIST],
            timeline_payloads=[_BLOCKED_TIMELINE, _SUCCESS_TIMELINE],
        )
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            await graph.ainvoke(_initial_state(), {"configurable": {"settings": _TEST_SETTINGS}})

        checklist_prompts, timeline_prompts = _prompts_by_domain(client)
        assert "[재시도]" not in checklist_prompts[0]
        assert "[재시도]" not in timeline_prompts[0]
        assert "[재시도]" in checklist_prompts[1]
        assert "[재시도]" in timeline_prompts[1]
        assert "활성 카테고리 VENUE에 생성된 항목이 없습니다" in timeline_prompts[1]

    @pytest.mark.asyncio
    async def test_still_blocked_after_one_retry_stops_instead_of_looping(self):
        # 재시도 상한(1회) 회귀 방지 — 두 번째도 BLOCKED이면 세 번째 라운드 없이 그래프가
        # 종료돼야 한다(app/services/personalization.py가 카탈로그 폴백 처리). 1라운드(2콜) +
        # 재시도(2콜) = 4콜에서 멈춰야 한다(6콜로 안 늘어남).
        client = _client_with_domain_responses(
            checklist_payloads=[_BLOCKED_CHECKLIST, _BLOCKED_CHECKLIST],
            timeline_payloads=[_BLOCKED_TIMELINE, _BLOCKED_TIMELINE],
        )
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(
                _initial_state(), {"configurable": {"settings": _TEST_SETTINGS}}
            )

        assert client.chat.completions.create.call_count == 4
        assert result["validation_status"] == {"CHECKLIST": "BLOCKED", "TIMELINE": "BLOCKED"}

    @pytest.mark.asyncio
    async def test_success_on_first_try_never_retries(self):
        client = _client_with_domain_responses(
            checklist_payloads=[_SUCCESS_CHECKLIST], timeline_payloads=[_SUCCESS_TIMELINE]
        )
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(
                _initial_state(), {"configurable": {"settings": _TEST_SETTINGS}}
            )

        assert client.chat.completions.create.call_count == 2
        assert result["retry_count"] == 0

    @pytest.mark.asyncio
    async def test_only_blocked_domain_is_retried_success_domain_carried_forward(self):
        # 2026-08-29 결정(red-bug.md #9-10) 핵심 회귀 — CHECKLIST가 1차에 이미 SUCCESS면
        # 재시도 패스에서 다시 안 만들고 그대로 carry-forward돼야 한다(재호출 안 됨). 큐에
        # CHECKLIST 응답을 1개만 넣어둬서, 혹시 재시도 때도 다시 호출되면 pop(0)이
        # IndexError로 즉시 실패한다.
        client = _client_with_domain_responses(
            checklist_payloads=[_SUCCESS_CHECKLIST],
            timeline_payloads=[_BLOCKED_TIMELINE, _SUCCESS_TIMELINE],
        )
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(
                _initial_state(), {"configurable": {"settings": _TEST_SETTINGS}}
            )

        assert client.chat.completions.create.call_count == 3
        assert result["validation_status"] == {"CHECKLIST": "SUCCESS", "TIMELINE": "SUCCESS"}
        assert result["retry_count"] == 1
        assert result["checklist_draft"][0]["title"] == "웨딩홀 계약서 확인"
        checklist_prompts, timeline_prompts = _prompts_by_domain(client)
        assert len(checklist_prompts) == 1
        assert len(timeline_prompts) == 2
        assert "[재시도]" in timeline_prompts[1]

    @pytest.mark.asyncio
    async def test_only_blocked_checklist_is_retried_timeline_carried_forward(self):
        # 위 테스트의 대칭 케이스(TIMELINE이 먼저 성공, CHECKLIST만 재시도).
        client = _client_with_domain_responses(
            checklist_payloads=[_BLOCKED_CHECKLIST, _SUCCESS_CHECKLIST],
            timeline_payloads=[_SUCCESS_TIMELINE],
        )
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(
                _initial_state(), {"configurable": {"settings": _TEST_SETTINGS}}
            )

        assert client.chat.completions.create.call_count == 3
        assert result["validation_status"] == {"CHECKLIST": "SUCCESS", "TIMELINE": "SUCCESS"}
        assert result["timeline_draft"][0]["title"] == "웨딩홀 계약"
        checklist_prompts, timeline_prompts = _prompts_by_domain(client)
        assert len(checklist_prompts) == 2
        assert len(timeline_prompts) == 1
        assert "[재시도]" in checklist_prompts[1]


_DUPLICATE_TITLE_TIMELINE = {
    "timeline_items": [
        {
            "category_code": "VENUE",
            "title": "예식장 투어 시작",
            "default_dday_offset_days": -300,
        },
        {
            "category_code": "VENUE",
            "title": "예식장 투어 시작",
            "default_dday_offset_days": -280,
        },
    ]
}


class TestDuplicateTitleTolerance:
    """2026-08-28 결정(red-bug.md #9-2) — 실계정 재현: LLM이 같은 응답 안에서 VENUE
    카테고리에 "예식장 투어 시작"을 두 번 만들어 도메인 전체가 BLOCKED → 카탈로그 폴백으로
    떨어졌다. 이제는 뒤에 나온 중복만 드롭하고 재시도 없이 첫 시도에 SUCCESS로 통과해야 한다."""

    @pytest.mark.asyncio
    async def test_duplicate_title_is_dropped_not_blocked(self):
        client = _client_with_domain_responses(
            checklist_payloads=[_SUCCESS_CHECKLIST],
            timeline_payloads=[_DUPLICATE_TITLE_TIMELINE],
        )
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(
                _initial_state(), {"configurable": {"settings": _TEST_SETTINGS}}
            )

        # 중복이 있었지만 dedup이 validate 전에 실행되므로 재시도 없이 1라운드(도메인별 1콜씩,
        # 총 2콜)에 SUCCESS다.
        assert client.chat.completions.create.call_count == 2
        assert result["validation_status"] == {"CHECKLIST": "SUCCESS", "TIMELINE": "SUCCESS"}
        assert result["retry_count"] == 0
        # 뒤에 나온 중복(offset=-280)만 드롭 — 먼저 나온 항목(offset=-300)은 그대로 남는다.
        assert len(result["timeline_draft"]) == 1
        assert result["timeline_draft"][0]["default_dday_offset_days"] == -300

    @pytest.mark.asyncio
    async def test_new_item_colliding_with_protected_title_still_blocks_on_coverage(self):
        # 새로 만든 유일한 TIMELINE 항목이 protected_items(사용자가 이미 수정한 기존 행)와
        # 제목이 겹쳐 드롭되면, 그 카테고리엔 결국 항목이 하나도 안 남는다 — 이건 dedup의
        # 버그가 아니라 커버리지 규칙(활성 카테고리마다 1개 이상)이 정상적으로 잡아내는
        # 별개의 실패다. 재시도까지 소진돼도 TIMELINE만 여전히 BLOCKED로 남아야 하고,
        # 이미 SUCCESS인 CHECKLIST는 재시도에서 다시 호출되지 않아야 한다.
        state = _initial_state()
        state["protected_items"] = {
            "CHECKLIST": [],
            "TIMELINE": [{"id": "x", "category_code": "VENUE", "title": "예식장 투어 시작"}],
        }
        colliding_timeline = {
            "timeline_items": [
                {
                    "category_code": "VENUE",
                    "title": "예식장 투어 시작",
                    "default_dday_offset_days": -300,
                }
            ]
        }
        client = _client_with_domain_responses(
            checklist_payloads=[_SUCCESS_CHECKLIST],
            timeline_payloads=[colliding_timeline, colliding_timeline],
        )
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(state, {"configurable": {"settings": _TEST_SETTINGS}})

        assert client.chat.completions.create.call_count == 3
        assert result["timeline_draft"] == []
        assert result["validation_status"]["TIMELINE"] == "BLOCKED"
        assert result["validation_status"]["CHECKLIST"] == "SUCCESS"


class TestContractCitationGrounding:
    """generate_node의 DS3(표준계약서) RAG grounding — 13_personalization_router_agent_design.md
    §1-3을 확장. LLM은 source_ref_id(정수)만 고르고, 실제 source_tier/label/url은
    _resolve_checklist_citations가 검색 결과에서 코드로 직접 채운다. 분리 호출 전환 후에도
    citations fetch는 (도메인 콜과 무관하게) generate_node 1회 실행당 최대 1번만 일어나야
    한다 — asyncio.gather로 병렬화됐다고 두 번 fetch되면 안 된다."""

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
        client = _client_with_domain_responses(
            checklist_payloads=[_SUCCESS_CHECKLIST], timeline_payloads=[_SUCCESS_TIMELINE]
        )
        with (
            patch("app.personalization.graph.get_azure_openai_client", return_value=client),
            patch("app.personalization.graph.retrieve", AsyncMock()) as mock_retrieve,
        ):
            graph = build_graph()
            await graph.ainvoke(_initial_state(), {"configurable": {"settings": _TEST_SETTINGS}})

        mock_retrieve.assert_not_called()

    @pytest.mark.asyncio
    async def test_matching_source_ref_id_resolves_to_real_citation(self):
        checklist_with_ref = {
            "checklist_items": [
                {
                    "category_code": "VENUE",
                    "item_type": "CONTRACT_TERM",
                    "title": "계약금 10% 상한 확인",
                    "body": "본문",
                    "priority": "high",
                    "source_ref_id": 7,
                }
            ]
        }
        client = _client_with_domain_responses(
            checklist_payloads=[checklist_with_ref], timeline_payloads=[_SUCCESS_TIMELINE]
        )
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
        checklist_with_bad_ref = {
            "checklist_items": [
                {
                    "category_code": "VENUE",
                    "item_type": "CONTRACT_TERM",
                    "title": "확인 항목",
                    "body": "본문",
                    "priority": "mid",
                    "source_ref_id": 999,
                }
            ]
        }
        client = _client_with_domain_responses(
            checklist_payloads=[checklist_with_bad_ref], timeline_payloads=[_SUCCESS_TIMELINE]
        )
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
        meeting_checklist = {
            "checklist_items": [
                {
                    "category_code": "MEETING",
                    "item_type": "PREP",
                    "title": "상견례 장소 예약",
                    "body": "본문",
                    "priority": "mid",
                }
            ]
        }
        meeting_timeline = {
            "timeline_items": [
                {
                    "category_code": "MEETING",
                    "title": "상견례 진행",
                    "default_dday_offset_days": -200,
                }
            ]
        }
        client = _client_with_domain_responses(
            checklist_payloads=[meeting_checklist], timeline_payloads=[meeting_timeline]
        )
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


class TestChecklistCategoryFanOut:
    """2026-08-30 결정(red-bug.md #9-11) — #129(도메인 분리) 배포 이후에도 staging에서
    CHECKLIST가 80% 확률로 계속 BLOCKED됐다. 활성 카테고리 전부(최대 9개)를 한 CHECKLIST
    호출이 커버해야 하는 구조가 원인이라, 카테고리 단위로 한 번 더 쪼갠다."""

    @pytest.mark.asyncio
    async def test_each_active_category_gets_its_own_independent_call(self):
        state = _initial_state()
        state["profile"] = {"active_categories": ["VENUE", "SDM"]}
        venue_checklist = {
            "checklist_items": [{"category_code": "VENUE", "title": "웨딩홀 계약서 확인"}]
        }
        sdm_checklist = {"checklist_items": [{"category_code": "SDM", "title": "드레스 피팅"}]}
        client = _client_with_checklist_categories_and_timeline(
            checklist_by_category={"VENUE": [venue_checklist], "SDM": [sdm_checklist]},
            timeline_payloads=[_SUCCESS_TIMELINE_VENUE_SDM],
        )
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(state, {"configurable": {"settings": _TEST_SETTINGS}})

        # 결합 1콜이 아니라 카테고리별 2콜(+TIMELINE 1콜) = 총 3콜.
        assert client.chat.completions.create.call_count == 3
        assert sorted(c for c in client.call_log if c != "TIMELINE") == ["SDM", "VENUE"]
        assert result["checklist_category_status"] == {"VENUE": "SUCCESS", "SDM": "SUCCESS"}
        titles = {item["title"] for item in result["checklist_draft"]}
        assert titles == {"웨딩홀 계약서 확인", "드레스 피팅"}

    @pytest.mark.asyncio
    async def test_llm_category_code_is_ignored_and_overwritten_with_the_requested_category(self):
        # 2026-08-30 결정(red-bug.md #24 후속) 회귀 — staging 라이브 테스트에서 LLM이
        # "HONEYMOON"을 "HONEYOON"으로 오타 내거나 다른 카테고리를 섞어 내는 사례가 실측됐다.
        # 이제 모델이 뭘 내든(오타·다른 카테고리·아예 누락) 무시하고 요청받은 카테고리로
        # 무조건 덮어써야 한다.
        state = _initial_state()
        state["trigger"] = "MANUAL_REGENERATE"
        state["requested_domains"] = ["CHECKLIST"]
        state["profile"] = {"active_categories": ["HONEYMOON"]}
        wrong_category = {
            "checklist_items": [
                {"category_code": "HONEYOON", "title": "여권 유효기간 확인"},
                {"category_code": "VENUE", "title": "환전 계획 세우기"},
                {"title": "여행자보험 가입"},  # category_code 아예 누락
            ]
        }
        client = _client_with_checklist_categories_and_timeline(
            checklist_by_category={"HONEYMOON": [wrong_category]},
        )
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(state, {"configurable": {"settings": _TEST_SETTINGS}})

        assert result["checklist_category_status"] == {"HONEYMOON": "SUCCESS"}
        assert all(item["category_code"] == "HONEYMOON" for item in result["checklist_draft"])
        assert len(result["checklist_draft"]) == 3

    @pytest.mark.asyncio
    async def test_one_blocked_category_is_retried_alone_success_category_not_recalled(self):
        # 이번 재발 버그의 핵심 회귀 — VENUE는 1차에 SUCCESS, SDM만 BLOCKED. VENUE 큐에
        # 응답을 1개만 넣어둬서, 재시도 때 VENUE가 다시 불리면 pop(0)이 StopIteration으로
        # 즉시 실패한다(carry-forward 위반 감지).
        state = _initial_state()
        state["profile"] = {"active_categories": ["VENUE", "SDM"]}
        venue_checklist = {
            "checklist_items": [{"category_code": "VENUE", "title": "웨딩홀 계약서 확인"}]
        }
        sdm_success = {"checklist_items": [{"category_code": "SDM", "title": "드레스 피팅"}]}
        client = _client_with_checklist_categories_and_timeline(
            checklist_by_category={
                "VENUE": [venue_checklist],
                "SDM": [{"checklist_items": []}, sdm_success],
            },
            timeline_payloads=[_SUCCESS_TIMELINE_VENUE_SDM],
        )
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(state, {"configurable": {"settings": _TEST_SETTINGS}})

        # VENUE 1콜 + SDM 2콜(1차 BLOCKED + 재시도 SUCCESS) + TIMELINE 1콜 = 총 4콜.
        assert client.chat.completions.create.call_count == 4
        assert client.call_log.count("VENUE") == 1
        assert client.call_log.count("SDM") == 2
        assert result["checklist_category_status"] == {"VENUE": "SUCCESS", "SDM": "SUCCESS"}
        assert result["retry_count"] == 1
        titles = {item["title"] for item in result["checklist_draft"]}
        assert titles == {"웨딩홀 계약서 확인", "드레스 피팅"}

    @pytest.mark.asyncio
    async def test_category_still_blocked_after_retry_reflected_in_final_status(self):
        # 카테고리 하나가 재시도까지 소진하고도 계속 BLOCKED면(예: 그래도 빈 응답),
        # checklist_category_status에 그대로 BLOCKED로 남아야 한다 —
        # app/services/personalization.py가 이 값으로 그 카테고리만 카탈로그 폴백한다.
        state = _initial_state()
        state["profile"] = {"active_categories": ["VENUE", "SDM"]}
        venue_checklist = {
            "checklist_items": [{"category_code": "VENUE", "title": "웨딩홀 계약서 확인"}]
        }
        client = _client_with_checklist_categories_and_timeline(
            checklist_by_category={
                "VENUE": [venue_checklist],
                "SDM": [{"checklist_items": []}, {"checklist_items": []}],
            },
            timeline_payloads=[_SUCCESS_TIMELINE_VENUE_SDM],
        )
        with patch("app.personalization.graph.get_azure_openai_client", return_value=client):
            graph = build_graph()
            result = await graph.ainvoke(state, {"configurable": {"settings": _TEST_SETTINGS}})

        assert client.call_log.count("SDM") == 2  # 1차 + 재시도 1회, 상한(_MAX_RETRIES=1) 소진
        assert result["checklist_category_status"] == {"VENUE": "SUCCESS", "SDM": "BLOCKED"}
        assert result["validation_status"]["CHECKLIST"] == "BLOCKED"
        # VENUE는 그래도 살아남아 checklist_draft에 남아있어야 한다(app/services/
        # personalization.py의 카테고리 단위 병합이 이 값을 그대로 신뢰).
        titles = {item["title"] for item in result["checklist_draft"]}
        assert titles == {"웨딩홀 계약서 확인"}
