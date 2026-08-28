"""app/rag/graph.py의 CRAG 조건부 재검색 루프(verify→retrieve, 최대 1회) — 2026-08-24 결정.
Azure OpenAI/retrieval mocking 선례가 이 레포에 없어 이 파일에서 새로 만든다. app.rag.graph가
app.rag.generation에서 import해 자기 네임스페이스에 바인딩한 이름들을 패치한다(원본 모듈이
아니라 graph.py가 실제로 호출하는 이름을 패치해야 효과가 있다)."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.config import Settings
from app.rag.graph import build_graph
from app.rag.retrieval import RetrievedChunk

# retrieve_node가 config["configurable"]에 settings가 없으면 get_settings()로 폴백하는데,
# 그건 .env(이 워크트리엔 없음)/환경변수에 의존해 테스트가 로컬·CI 환경에 따라 깨질 수 있다 —
# Settings의 필수 필드(기본값 없는 7개, 2026-08-25 영수증 OCR 결정으로 azure_storage_blob_
# endpoint 추가돼 6→7)만 채운 더미 인스턴스를 명시적으로 넘겨 환경 의존을 없앤다.
_TEST_SETTINGS = Settings(
    database_url="postgresql://test",
    azure_openai_endpoint="https://test.openai.azure.com",
    google_client_id="test",
    google_client_secret="test",
    naver_client_id="test",
    naver_client_secret="test",
    azure_storage_blob_endpoint="https://test.blob.core.windows.net",
)


def _chunk(chunk_id: int) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id, content="본문", title="제목", source_tier="OFFICIAL", source_url=None
    )


def _stream_client(*answer_texts: str) -> MagicMock:
    """generate_node의 client.chat.completions.create(stream=True) 호출을 흉내낸다. 델타
    토큰을 async iterable로 하나씩 내보내는 가짜 스트림 — 호출마다(1차/2차) 다른 텍스트를 내야
    하므로 return_value가 아니라 side_effect로 매 호출마다 새 제너레이터를 뽑는다(제너레이터는
    1회 소비되면 재사용 불가)."""

    async def _stream(text: str):
        for ch in text:
            yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=ch))])

    client = MagicMock()
    client.chat.completions.create = AsyncMock(side_effect=[_stream(t) for t in answer_texts])
    return client


def _initial_state() -> dict:
    return {
        "query": "위약금 얼마나 나와요?",
        "category_code": None,
        "context": [],
        "answer": "",
        "verdict": "",
        "verification_reason": "",
        "retry_count": 0,
    }


async def _run(
    client: MagicMock,
    retrieve_results: list[list[RetrievedChunk]],
    verify_results: list[tuple[str, str]],
):
    """그래프를 astream(stream_mode=["custom","values"])로 돌려 retry 커스텀 이벤트 목록과
    최종 state를 함께 얻는다 — app/services/chat.py의 실제 소비 패턴과 동일."""
    graph = build_graph()
    config = {"configurable": {"session": object(), "settings": _TEST_SETTINGS}}
    retry_events: list[dict] = []
    final_state = _initial_state()
    with (
        patch("app.rag.graph.get_azure_openai_client", return_value=client),
        patch("app.rag.graph.retrieve", AsyncMock(side_effect=retrieve_results)) as retrieve_mock,
        patch("app.rag.graph.verify_answer", AsyncMock(side_effect=verify_results)),
        patch("app.rag.graph.reformulate_query", AsyncMock(return_value="재구성된 질의")),
    ):
        async for mode, chunk in graph.astream(
            _initial_state(), config, stream_mode=["custom", "values"]
        ):
            if mode == "custom":
                if chunk["type"] == "retry":
                    retry_events.append(chunk)
            else:
                final_state = chunk
    return final_state, retry_events, retrieve_mock


class TestNoRetryWhenSupportedOnFirstTry:
    async def test_retrieve_called_once_and_retry_count_stays_zero(self):
        client = _stream_client("1차 답변")
        final_state, retry_events, retrieve_mock = await _run(
            client,
            retrieve_results=[[_chunk(1)]],
            verify_results=[("SUPPORTED", "근거 충분")],
        )

        assert retrieve_mock.call_count == 1
        assert retry_events == []
        assert final_state["retry_count"] == 0
        assert final_state["verdict"] == "SUPPORTED"
        assert final_state["answer"] == "1차 답변"


class TestRetryOnceThenSupported:
    async def test_retrieve_called_twice_with_reformulated_query_and_retry_count_one(self):
        client = _stream_client("1차 답변", "2차 답변")
        final_state, retry_events, retrieve_mock = await _run(
            client,
            retrieve_results=[[_chunk(1)], [_chunk(2)]],
            verify_results=[("WEAK", "이유1"), ("SUPPORTED", "이유2")],
        )

        assert retrieve_mock.call_count == 2
        # retrieve(session, search_query, category_code, settings) — 2번째 호출의 검색어가
        # 재구성된 질의(reformulate_query 반환값)인지 확인.
        assert retrieve_mock.call_args_list[1].args[1] == "재구성된 질의"
        assert len(retry_events) == 1
        assert retry_events[0]["reason"] == "이유1"
        assert final_state["retry_count"] == 1
        assert final_state["verdict"] == "SUPPORTED"
        # 2차 답변이 1차 답변을 완전히 교체했는지(이어붙지 않았는지) 확인.
        assert final_state["answer"] == "2차 답변"


class TestRetryCapStopsAfterOneAttempt:
    """이 기능의 안전장치(_MAX_RETRIES=1) 자체를 검증하는 가장 중요한 케이스 — 2차 verify도
    WEAK/GENERAL이면 그래도 더 이상 재시도하지 않고 강제 종료돼야 한다(무한루프 없음)."""

    async def test_stops_after_second_verify_even_if_still_weak(self):
        client = _stream_client("1차 답변", "2차 답변")
        final_state, retry_events, retrieve_mock = await _run(
            client,
            retrieve_results=[[_chunk(1)], [_chunk(2)]],
            verify_results=[("WEAK", "이유1"), ("GENERAL", "이유2")],
        )

        assert retrieve_mock.call_count == 2  # 3번째 호출이 없어야 함
        assert len(retry_events) == 1  # 2차 verify 이후엔 retry 이벤트가 더 안 나옴
        assert final_state["retry_count"] == 1
        assert final_state["verdict"] == "GENERAL"  # 2차 결과 그대로, 강제 종료됐다는 뜻


# 2026-08-26 챗 SSE 타임아웃 회귀 수정 — verify_node/retrieve_node(재시도)가 스트리밍 없는
# 단발 LLM 호출(verify_answer/reformulate_query) 대기 중 heartbeat 커스텀 이벤트를 흘려보내는지
# 확인한다(app/rag/graph.py::_await_with_heartbeat). _HEARTBEAT_INTERVAL_SECONDS를 짧게
# 패치해 실제로 몇 초씩 기다리지 않고도 반복 tick을 재현한다.
class TestVerifyHeartbeat:
    async def test_emits_heartbeat_while_verify_answer_is_slow(self):
        client = _stream_client("1차 답변")

        async def _slow_verify(*_args, **_kwargs):
            await asyncio.sleep(0.05)
            return ("SUPPORTED", "근거 충분")

        graph = build_graph()
        config = {"configurable": {"session": object(), "settings": _TEST_SETTINGS}}
        heartbeats: list[dict] = []
        with (
            patch("app.rag.graph.get_azure_openai_client", return_value=client),
            patch("app.rag.graph.retrieve", AsyncMock(return_value=[_chunk(1)])),
            patch("app.rag.graph.verify_answer", AsyncMock(side_effect=_slow_verify)),
            patch("app.rag.graph._HEARTBEAT_INTERVAL_SECONDS", 0.01),
        ):
            async for mode, chunk in graph.astream(
                _initial_state(), config, stream_mode=["custom", "values"]
            ):
                if mode == "custom" and chunk["type"] == "heartbeat":
                    heartbeats.append(chunk)

        assert len(heartbeats) >= 1


class TestReformulateHeartbeat:
    async def test_emits_heartbeat_while_reformulate_query_is_slow(self):
        client = _stream_client("1차 답변", "2차 답변")

        async def _slow_reformulate(*_args, **_kwargs):
            await asyncio.sleep(0.05)
            return "재구성된 질의"

        graph = build_graph()
        config = {"configurable": {"session": object(), "settings": _TEST_SETTINGS}}
        heartbeats: list[dict] = []
        with (
            patch("app.rag.graph.get_azure_openai_client", return_value=client),
            patch(
                "app.rag.graph.retrieve",
                AsyncMock(side_effect=[[_chunk(1)], [_chunk(2)]]),
            ),
            patch(
                "app.rag.graph.verify_answer",
                AsyncMock(side_effect=[("WEAK", "이유1"), ("SUPPORTED", "이유2")]),
            ),
            patch("app.rag.graph.reformulate_query", AsyncMock(side_effect=_slow_reformulate)),
            patch("app.rag.graph._HEARTBEAT_INTERVAL_SECONDS", 0.01),
        ):
            async for mode, chunk in graph.astream(
                _initial_state(), config, stream_mode=["custom", "values"]
            ):
                if mode == "custom" and chunk["type"] == "heartbeat":
                    heartbeats.append(chunk)

        assert len(heartbeats) >= 1
