"""app/rag/graph.py의 CRAG 조건부 재검색 루프(verify→retrieve, 최대 1회) — 2026-08-24 결정.
Azure OpenAI/retrieval mocking 선례가 이 레포에 없어 이 파일에서 새로 만든다. app.rag.graph가
app.rag.generation에서 import해 자기 네임스페이스에 바인딩한 이름들을 패치한다(원본 모듈이
아니라 graph.py가 실제로 호출하는 이름을 패치해야 효과가 있다)."""

import asyncio
from types import SimpleNamespace
from typing import Self
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.config import Settings
from app.rag.graph import build_graph
from app.rag.retrieval import RetrievalOutcome, RetrievedChunk

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


# Phase 7 감사(Low) 회귀 방지용 — 이 파일의 다른 테스트는 _TEST_SETTINGS에 Langfuse 키가 없어
# traced_span이 항상 no-op이라 span에 실제로 뭐가 기록되는지 검증하지 못한다. app.rag.graph.
# traced_span 자체를 이 가짜로 교체해 trace.update(output=...) 호출 내용을 직접 들여다본다.
class _RecordedSpan:
    def __init__(self, name: str, calls: list[dict]):
        self._name = name
        self._calls = calls
        self.trace_id = None

    def update(self, **kwargs: object) -> None:
        self._calls.append({"span_name": self._name, **kwargs})

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *exc_info: object) -> bool:
        return False


def _recording_traced_span(calls: list[dict]):
    def _factory(name: str, **_kwargs: object) -> _RecordedSpan:
        return _RecordedSpan(name, calls)

    return _factory


def _initial_state() -> dict:
    return {
        "query": "위약금 얼마나 나와요?",
        "category_code": None,
        "context": [],
        "answer": "",
        "verdict": "",
        "verification_reason": "",
        "retry_count": 0,
        "out_of_scope": False,
        "history": [],
        "resolved_query": "",
        "profile_block": "",
    }


# 스코프 컷오프(rag_min_similarity=0.30)에 걸리지 않는 충분히 높은 유사도 — 이 파일의 테스트는
# CRAG 재검색 루프를 보는 것이라 컷오프는 항상 통과시켜야 한다. 컷오프 자체의 회귀 테스트는
# tests/test_chat_scope_cutoff.py에 따로 있다.
_PASSING_SIMILARITY = 0.9


def _outcome(*chunks: RetrievedChunk, similarity: float = _PASSING_SIMILARITY) -> RetrievalOutcome:
    return RetrievalOutcome(chunks=list(chunks), top_similarity=similarity)


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
        patch(
            "app.rag.graph.retrieve_with_similarity",
            AsyncMock(side_effect=[_outcome(*r) for r in retrieve_results]),
        ) as retrieve_mock,
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
            patch(
                "app.rag.graph.retrieve_with_similarity",
                AsyncMock(return_value=_outcome(_chunk(1))),
            ),
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
                "app.rag.graph.retrieve_with_similarity",
                AsyncMock(side_effect=[_outcome(_chunk(1)), _outcome(_chunk(2))]),
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


# red-bug.md #18 — retrieve_node의 Langfuse span에 검색된 chunk_id가 output으로 안 남던 문제의
# 회귀 테스트. app.rag.graph.traced_span을 _recording_traced_span으로 교체해 실제로 무엇이
# trace.update()에 실리는지 검증한다(다른 클래스들은 트레이싱이 항상 꺼져 있어 이 부분을 못 본다).
class TestRetrieveSpanRecordsChunkIds:
    async def test_records_chunk_ids_on_first_retrieve(self):
        client = _stream_client("1차 답변")
        span_calls: list[dict] = []
        graph = build_graph()
        config = {"configurable": {"session": object(), "settings": _TEST_SETTINGS}}
        with (
            patch("app.rag.graph.get_azure_openai_client", return_value=client),
            patch(
                "app.rag.graph.retrieve_with_similarity",
                AsyncMock(return_value=_outcome(_chunk(1), _chunk(2))),
            ),
            patch(
                "app.rag.graph.verify_answer",
                AsyncMock(return_value=("SUPPORTED", "근거 충분")),
            ),
            patch("app.rag.graph.traced_span", _recording_traced_span(span_calls)),
        ):
            async for _ in graph.astream(_initial_state(), config, stream_mode="values"):
                pass

        retrieve_calls = [c for c in span_calls if c["span_name"] == "chat.retrieve"]
        assert len(retrieve_calls) == 1
        assert retrieve_calls[0]["output"] == {
            "chunk_ids": [1, 2],
            "top_similarity": _PASSING_SIMILARITY,
        }

    async def test_records_empty_list_when_no_chunks_found(self):
        """0건 검색(RAG_NO_CONTEXT)도 output=[]로 명시적으로 남아야 한다 — 필드 자체가
        빠지면 "0건"과 "기록 안 됨"을 Langfuse UI에서 구분할 수 없다(§18 사이드이펙트 3번).

        graph.py 모듈 독스트링("0건 검색 → GENERAL → 재구성된 질의로 1회 재검색을 시도한다")
        대로, context가 비어 있으면 verify_node가 무조건 GENERAL을 반환해 그 자체로 재시도
        조건(_route_after_verify)을 충족한다 — 즉 검색이 0건이어도 chat.retrieve span 하나로
        끝나지 않고 chat.retrieve_retry까지 자동으로 한 번 더 돈다(reformulate_query 목이
        필요한 이유). generate_node는 두 번 다 context가 비어 있어 LLM을 안 부르므로 client는
        실제로 호출되지 않는다 — 인자 없이 만들어 그 사실을 드러낸다."""
        client = _stream_client()
        span_calls: list[dict] = []
        graph = build_graph()
        config = {"configurable": {"session": object(), "settings": _TEST_SETTINGS}}
        with (
            patch("app.rag.graph.get_azure_openai_client", return_value=client),
            patch("app.rag.graph.retrieve_with_similarity", AsyncMock(return_value=_outcome())),
            patch("app.rag.graph.reformulate_query", AsyncMock(return_value="재구성된 질의")),
            patch("app.rag.graph.traced_span", _recording_traced_span(span_calls)),
        ):
            async for _ in graph.astream(_initial_state(), config, stream_mode="values"):
                pass

        retrieve_calls = [c for c in span_calls if c["span_name"] == "chat.retrieve"]
        assert len(retrieve_calls) == 1
        assert retrieve_calls[0]["output"] == {
            "chunk_ids": [],
            "top_similarity": _PASSING_SIMILARITY,
        }
        # 위 독스트링대로 재시도 span도 자동으로 도는지, 거기서도 output=[]가 명시적으로
        # 남는지까지 같이 확인한다.
        retry_calls = [c for c in span_calls if c["span_name"] == "chat.retrieve_retry"]
        assert len(retry_calls) == 1
        assert retry_calls[0]["output"] == {
            "chunk_ids": [],
            "top_similarity": _PASSING_SIMILARITY,
        }

    async def test_records_chunk_ids_on_retry_span_too(self):
        """chat.retrieve_retry span도 같은 함수 본문을 타므로 별도 처리 없이 자동으로
        커버돼야 한다(§18 설계 — "재시도 경로도 자동으로 같이 좋아진다")."""
        client = _stream_client("1차 답변", "2차 답변")
        span_calls: list[dict] = []
        graph = build_graph()
        config = {"configurable": {"session": object(), "settings": _TEST_SETTINGS}}
        with (
            patch("app.rag.graph.get_azure_openai_client", return_value=client),
            patch(
                "app.rag.graph.retrieve_with_similarity",
                AsyncMock(side_effect=[_outcome(_chunk(1)), _outcome(_chunk(2), _chunk(3))]),
            ),
            patch(
                "app.rag.graph.verify_answer",
                AsyncMock(side_effect=[("WEAK", "이유1"), ("SUPPORTED", "이유2")]),
            ),
            patch("app.rag.graph.reformulate_query", AsyncMock(return_value="재구성된 질의")),
            patch("app.rag.graph.traced_span", _recording_traced_span(span_calls)),
        ):
            async for _ in graph.astream(_initial_state(), config, stream_mode="values"):
                pass

        retry_calls = [c for c in span_calls if c["span_name"] == "chat.retrieve_retry"]
        assert len(retry_calls) == 1
        assert retry_calls[0]["output"] == {
            "chunk_ids": [2, 3],
            "top_similarity": _PASSING_SIMILARITY,
        }


class TestPartialStateCompatibility:
    """scripts/run_rag_eval.py(골든 21문항 평가)는 `{"query", "category_code"}` 2개 키만 담은
    **부분 state**로 ainvoke한다 — 이 파일 상단 graph.py docstring이 경고한 함정이다.
    새 state 키를 `state["..."]`로 읽으면 그 스크립트가 KeyError로 깨진다."""

    async def test_graph_runs_with_only_query_and_category_code(self):
        client = _stream_client("답변")
        with (
            patch("app.rag.graph.get_azure_openai_client", return_value=client),
            patch(
                "app.rag.graph.retrieve_with_similarity",
                AsyncMock(return_value=_outcome(_chunk(1))),
            ),
            patch("app.rag.graph.verify_answer", AsyncMock(return_value=("SUPPORTED", "이유"))),
        ):
            graph = build_graph()
            result = await graph.ainvoke(
                {"query": "예식장 계약 주의점", "category_code": "VENUE"},
                # run_rag_eval.py와 동일하게 session도 함께 넘긴다(retrieve_node가 쓴다).
                {"configurable": {"settings": _TEST_SETTINGS, "session": MagicMock()}},
            )

        assert result["verdict"] == "SUPPORTED"
