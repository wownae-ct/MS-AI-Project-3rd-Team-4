"""app/services/chat.py::stream_chat_response 특성화 테스트.

**왜 이 파일이 필요한가.** 이 함수는 204줄에 중첩 10단계로 이 레포에서 가장 복잡한 축인데,
2026-09-01 조사 시점까지 **실행되는 테스트가 한 줄도 없었다** — test_smoke.py는 이 심볼 자체를
monkeypatch로 바꿔치기해(라우터→서비스 인자 배선만 확인) 본문을 0줄 실행한다. 리팩토링으로
동작이 바뀌어도 아무도 모르는 상태였다.

여기서 봉인하는 것은 "무엇을 저장했는가"가 아니라 **관측 가능한 3축**이다:
  1. SSE 프레임의 **순서** (heartbeat 주석 줄 위치 포함)
  2. add/commit의 **시간순 인터리브** — 특히 실패 시 커밋이 1회냐 2회냐
  3. `trace.trace_id`가 span 블록 **밖에서** assistant_message.trace_ref로 쓰이는 구조

전체 JSON을 통째로 비교하지 않는다. 그렇게 하면 이 테스트가 안전망이 아니라 자물쇠가 되어
리팩토링을 막는다.

**의도적으로 봉인하지 않는 것**: chat_profile 블록이 채워진 경로. load_chat_profile이 DB를
5~6회 때려 대역이 비대해지는데, FakeSession.get이 None을 돌려주면 그 분기가 통째로 건너뛰어진다
(코드가 `if wedding is not None:`으로 감싸고 있다). 대신 그 블록은 리팩토링 대상에서 제외한다.
"""

import uuid
from unittest.mock import patch

import httpx
import pytest
from conftest import parse_sse_frames
from fakes import (
    TEST_SETTINGS,
    FakeGraph,
    FakeSession,
    fake_session_factory,
    recording_traced_span,
)
from openai import RateLimitError

from app.models import ChatSession
from app.rag.retrieval import RetrievedChunk
from app.schemas.chat import ChatMessageCreate
from app.services.chat import (
    _RATE_LIMITED_MESSAGE,
    _UPSTREAM_LLM_ERROR_MESSAGE,
    stream_chat_response,
)

_SESSION_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
_WEDDING_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")
_OWNER_ID = uuid.UUID("33333333-3333-3333-3333-333333333333")

_IN_SCOPE_QUERY = "예식장 위약금 얼마나 나와요?"
# app/rag/scope_check.py::_OUT_OF_SCOPE_HINTS 의 문구와 정확히 일치해야 한다
# (부분문자열 매칭이라 "소설 한 편 써줘"는 걸리지 않는다 — 이 테스트를 처음
# 작성할 때 실제로 헛짚었다).
_OUT_OF_SCOPE_QUERY = "소설 써줘"


def _chat_session(title: str | None = None) -> ChatSession:
    return ChatSession(id=_SESSION_ID, wedding_id=_WEDDING_ID, category_code=None, title=title)


def _chunk(chunk_id: int = 1) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        content="본문",
        title="공정위 표준약관",
        source_tier="OFFICIAL",
        source_url="https://example.test/doc",
    )


def _final_state(**overrides: object) -> dict:
    state = {
        "query": _IN_SCOPE_QUERY,
        "category_code": None,
        "context": [_chunk()],
        "answer": "위약금은 계약 시점에 따라 다릅니다.",
        "verdict": "SUPPORTED",
        "verification_reason": "표준약관에 근거함",
        "retry_count": 0,
        "out_of_scope": False,
        "history": [],
        "resolved_query": "",
        "profile_block": "",
    }
    state.update(overrides)
    return state


def _rate_limit_error() -> RateLimitError:
    # openai의 APIStatusError 계열은 message 위치인자 + response/body 키워드가 필수다.
    request = httpx.Request("POST", "https://test.openai.azure.com")
    return RateLimitError(
        "Rate limit reached for gpt-5.4 (SDK 원문)",
        response=httpx.Response(429, request=request),
        body=None,
    )


async def _run(
    script: list,
    *,
    query: str = _IN_SCOPE_QUERY,
    chat_session: ChatSession | None = None,
    history_rows: list | None = None,
) -> tuple[list, FakeSession, FakeGraph, list[dict]]:
    """stream_chat_response를 끝까지 소비하고 (SSE프레임, 세션, 그래프, span기록)을 돌려준다."""
    session = FakeSession(
        chat_session=chat_session if chat_session is not None else _chat_session(),
        history_rows=history_rows or [],
        wedding=None,  # ← chat_profile 조회 분기를 통째로 건너뛰게 한다
    )
    graph = FakeGraph(script)
    span_calls: list[dict] = []

    with (
        patch("app.services.chat.get_session_factory", fake_session_factory(session)),
        patch("app.services.chat.get_settings", lambda: TEST_SETTINGS),
        patch("app.services.chat._GRAPH", graph),
        patch("app.services.chat.traced_span", recording_traced_span(span_calls)),
    ):
        body = "".join(
            [
                part
                async for part in stream_chat_response(
                    _SESSION_ID, _WEDDING_ID, _OWNER_ID, ChatMessageCreate(content=query)
                )
            ]
        )
    return parse_sse_frames(body), session, graph, span_calls


def _event_names(frames: list) -> list[str | None]:
    return [name for name, _ in frames]


@pytest.fixture(scope="module")
async def normal_result() -> tuple:
    return await _run(
        [
            ("custom", {"type": "stage", "stage": "retrieve"}),
            ("custom", {"type": "token", "delta": "위약금은 "}),
            ("custom", {"type": "token", "delta": "계약 시점에 따라 다릅니다."}),
            ("values", _final_state()),
        ]
    )


@pytest.fixture(scope="module")
async def retry_result() -> tuple:
    return await _run(
        [
            ("custom", {"type": "stage", "stage": "retrieve"}),
            ("values", _final_state(answer="1차 답변", verdict="WEAK", retry_count=0)),
            ("custom", {"type": "heartbeat"}),
            ("custom", {"type": "retry", "reason": "근거 부족"}),
            ("custom", {"type": "token", "delta": "2차 답변"}),
            ("values", _final_state(answer="2차 답변", verdict="SUPPORTED", retry_count=1)),
        ]
    )


@pytest.fixture(scope="module")
async def out_of_scope_result() -> tuple:
    return await _run([], query=_OUT_OF_SCOPE_QUERY)


@pytest.fixture(scope="module")
async def rate_limited_result() -> tuple:
    return await _run(
        [
            ("custom", {"type": "token", "delta": "이미 흘려보낸 답변"}),
            ("values", _final_state(answer="이미 흘려보낸 답변", verdict="WEAK")),
            _rate_limit_error(),
        ]
    )


@pytest.fixture(scope="module")
async def upstream_failure_result() -> tuple:
    return await _run(
        [
            ("custom", {"type": "stage", "stage": "retrieve"}),
            RuntimeError("검색 단계에서 터짐"),
        ]
    )


class TestNormalPath:
    """S1 — 정상 경로."""

    async def test_sse_event_order(self, normal_result: tuple) -> None:
        frames, _, _, _ = normal_result
        assert _event_names(frames) == [
            "stage",
            "token",
            "token",
            "citations",
            "verification",
            "done",
        ]

    async def test_commits_twice(self, normal_result: tuple) -> None:
        """user 메시지 1회 + assistant 메시지 1회. 이 둘 사이가 의도된 부분 실패 지점이다."""
        _, session, _, _ = normal_result
        assert session.commit_count == 2
        assert session.op_names() == ["add", "commit", "add", "commit", "refresh"]

    async def test_user_message_saved_before_graph_runs(self, normal_result: tuple) -> None:
        _, session, _, _ = normal_result
        user_message = session.added[0]
        assert user_message.role == "user"
        assert user_message.content == _IN_SCOPE_QUERY

    async def test_assistant_message_fields(self, normal_result: tuple) -> None:
        _, session, _, _ = normal_result
        assistant = session.added[1]
        assert assistant.role == "assistant"
        assert assistant.content == "위약금은 계약 시점에 따라 다릅니다."
        assert assistant.verification == {
            "verdict": "SUPPORTED",
            "reason": "표준약관에 근거함",
        }
        assert [c["chunk_id"] for c in assistant.citations] == [1]
        assert assistant.latency_ms >= 0

    async def test_trace_id_read_outside_span_block(self, normal_result: tuple) -> None:
        """trace는 `async with traced_span(...)` 안에서 만들어지는데 trace_ref는 블록 밖에서
        읽힌다. 리팩토링으로 span 경계를 옮기면 이 단언이 먼저 깨진다."""
        _, session, _, _ = normal_result
        assert session.added[1].trace_ref == "trace-fake"

    async def test_first_message_fills_session_title(self, normal_result: tuple) -> None:
        _, session, _, _ = normal_result
        assert session._chat_session.title == _IN_SCOPE_QUERY
        assert session._chat_session.last_message_at is not None

    async def test_trace_update_payload(self, normal_result: tuple) -> None:
        _, _, _, span_calls = normal_result
        assert len(span_calls) == 1
        call = span_calls[0]
        assert call["span_name"] == "chat"
        assert call["output"] == "위약금은 계약 시점에 따라 다릅니다."
        assert call["metadata"]["verdict"] == "SUPPORTED"
        assert call["metadata"]["retried"] is False
        assert call["metadata"]["out_of_scope"] is False

    async def test_graph_receives_stream_mode(self, normal_result: tuple) -> None:
        _, _, graph, _ = normal_result
        assert graph.astream_calls == 1
        assert graph.last_stream_mode == ["custom", "values"]


class TestCragRetryPath:
    """S2 — CRAG 재검색. heartbeat 주석 줄과 "마지막 values만 반영" 규칙을 봉인한다."""

    async def test_heartbeat_becomes_bare_comment_line(self, retry_result: tuple) -> None:
        """heartbeat은 event/data가 아니라 `:` 주석 줄이라 프론트 파서가 그냥 무시한다."""
        frames, _, _, _ = retry_result
        assert (None, "heartbeat") in frames

    async def test_sse_event_order(self, retry_result: tuple) -> None:
        frames, _, _, _ = retry_result
        assert _event_names(frames) == [
            "stage",
            None,  # heartbeat 주석
            "retry",
            "token",
            "citations",
            "verification",
            "done",
        ]

    async def test_only_last_values_snapshot_survives(self, retry_result: tuple) -> None:
        _, session, _, _ = retry_result
        assert session.added[1].content == "2차 답변"
        assert session.added[1].verification["verdict"] == "SUPPORTED"

    async def test_retry_reflected_in_trace(self, retry_result: tuple) -> None:
        _, _, _, span_calls = retry_result
        assert span_calls[0]["metadata"]["retry_count"] == 1
        assert span_calls[0]["metadata"]["retried"] is True


class TestOutOfScopePath:
    """S3 — 스코프 가드. "무관한 요청엔 비용을 아예 안 쓴다"는 설계 의도의 기계적 증거."""

    async def test_graph_is_never_invoked(self, out_of_scope_result: tuple) -> None:
        _, _, graph, _ = out_of_scope_result
        assert graph.astream_calls == 0

    async def test_sse_event_order(self, out_of_scope_result: tuple) -> None:
        frames, _, _, _ = out_of_scope_result
        assert _event_names(frames) == ["token", "citations", "verification", "done"]

    async def test_dedicated_verdict_not_general(self, out_of_scope_result: tuple) -> None:
        """근거 없음(GENERAL)과 질문 자체를 거절한 것은 다른 상황이라 전용 verdict를 쓴다."""
        frames, _, _, _ = out_of_scope_result
        verification = dict(frames)["verification"]
        assert verification["verdict"] == "OUT_OF_SCOPE"

    async def test_no_citations(self, out_of_scope_result: tuple) -> None:
        frames, _, _, _ = out_of_scope_result
        assert dict(frames)["citations"]["citations"] == []

    async def test_still_commits_twice(self, out_of_scope_result: tuple) -> None:
        _, session, _, _ = out_of_scope_result
        assert session.commit_count == 2


class TestRateLimitedWithAnswer:
    """S4 — 답변은 이미 스트리밍됐는데 그 뒤 429. 최선을 다해 저장한다."""

    async def test_sse_event_order_ends_with_error_not_done(
        self, rate_limited_result: tuple
    ) -> None:
        frames, _, _, _ = rate_limited_result
        assert _event_names(frames) == ["token", "citations", "verification", "error"]

    async def test_answer_is_persisted_despite_failure(self, rate_limited_result: tuple) -> None:
        _, session, _, _ = rate_limited_result
        assert session.commit_count == 2
        assert session.added[1].content == "이미 흘려보낸 답변"

    async def test_error_message_is_curated_not_sdk_text(self, rate_limited_result: tuple) -> None:
        """2026-08-26 레드팀 감사 3라운드 MEDIUM #10 회귀 방지 — SDK 원문을 SSE로 노출했었다."""
        frames, _, _, _ = rate_limited_result
        error = dict(frames)["error"]
        assert error["code"] == "RATE_LIMITED"
        assert error["message"] == _RATE_LIMITED_MESSAGE
        assert "SDK 원문" not in error["message"]

    async def test_sdk_detail_kept_in_trace_only(self, rate_limited_result: tuple) -> None:
        _, _, _, span_calls = rate_limited_result
        metadata = span_calls[0]["metadata"]
        assert metadata["error_code"] == "RATE_LIMITED"
        assert "SDK 원문" in metadata["error_detail"]


class TestUpstreamFailureWithoutAnswer:
    """S5 — 답변이 생기기 전에 터진 경우. **커밋 1회, user 메시지만 남는 게 의도된 동작.**"""

    async def test_only_user_message_survives(self, upstream_failure_result: tuple) -> None:
        _, session, _, _ = upstream_failure_result
        assert session.commit_count == 1
        assert len(session.added) == 1
        assert session.added[0].role == "user"

    async def test_sse_has_error_only_no_citations_or_done(
        self, upstream_failure_result: tuple
    ) -> None:
        frames, _, _, _ = upstream_failure_result
        assert _event_names(frames) == ["stage", "error"]

    async def test_error_code_and_message(self, upstream_failure_result: tuple) -> None:
        frames, _, _, _ = upstream_failure_result
        error = dict(frames)["error"]
        assert error["code"] == "UPSTREAM_LLM_ERROR"
        assert error["message"] == _UPSTREAM_LLM_ERROR_MESSAGE
