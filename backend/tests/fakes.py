"""DB·LLM·Langfuse 없이 서비스 계층을 통째로 돌리기 위한 가짜 인프라.

이 레포엔 가짜 AsyncSession 선례가 없었다(2026-09-01 기준 grep 확인). app/services/chat.py의
stream_chat_response처럼 "세션을 스스로 열고, 커밋을 두 번 하고, 그 사이에 yield 하는" 함수는
실 DB 없이는 한 줄도 실행되지 않아 테스트가 0개였다 — 그 공백을 메우려고 만든다.

conftest.py의 픽스처(실 DB에 행을 남기는 ASGI 클라이언트)와 **의도적으로 분리**돼 있다. 여기
있는 것들은 전부 인메모리라 반복 실행해도 공유 DB를 오염시키지 않는다.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterable
from typing import Any, Self

from app.core.config import Settings

# 필수 필드(기본값 없는 7개)만 채운 더미. Langfuse 키가 없으므로 traced_span은 자동으로
# no-op이 된다(app/core/tracing.py::is_tracing_enabled) — 그래서 대부분의 테스트는 span을
# 따로 패치할 필요가 없다. tests/test_chat_graph.py의 _TEST_SETTINGS와 같은 목적이다.
TEST_SETTINGS = Settings(
    database_url="postgresql://test",
    azure_openai_endpoint="https://test.openai.azure.com",
    google_client_id="test",
    google_client_secret="test",
    naver_client_id="test",
    naver_client_secret="test",
    azure_storage_blob_endpoint="https://test.blob.core.windows.net",
)


class FakeResult:
    """session.execute()의 반환값. 호출부가 실제로 쓰는 두 메서드만 흉내낸다."""

    def __init__(self, *, scalar: Any = None, rows: Iterable[Any] = ()) -> None:
        self._scalar = scalar
        self._rows = list(rows)

    def scalar_one_or_none(self) -> Any:
        return self._scalar

    def all(self) -> list[Any]:
        return list(self._rows)


class FakeSession:
    """인메모리 AsyncSession 대역.

    **execute()를 호출 순서가 아니라 컴파일된 SQL의 테이블 이름으로 분기한다.** 순서 기반
    side_effect 리스트가 쓰기는 쉽지만, 그러면 이 대역이 "쿼리 순서를 바꾸면 깨지는 자물쇠"가
    되어 리팩토링을 막는다 — 특성화 테스트의 목적과 정반대다. SQLAlchemy 절을 문자열로 만들어
    단언하는 방식 자체는 tests/test_personalization_service.py에 선례가 있다.

    add/commit/refresh는 **시간순 로그**(ops)로 남긴다. stream_chat_response의 진짜 특성이
    "무엇을 저장했는가"가 아니라 "user 메시지 커밋과 assistant 메시지 커밋 사이 어디서 끊겼는가"
    이기 때문이다(실패 시 user 메시지만 남는 것이 의도된 동작).
    """

    def __init__(
        self,
        *,
        chat_session: Any = None,
        history_rows: Iterable[Any] = (),
        wedding: Any = None,
    ) -> None:
        self._chat_session = chat_session
        self._history_rows = list(history_rows)
        self._wedding = wedding
        self.ops: list[tuple[str, Any]] = []

    async def execute(self, statement: Any) -> FakeResult:
        sql = str(statement)
        if "chat_sessions" in sql:
            return FakeResult(scalar=self._chat_session)
        if "chat_messages" in sql:
            return FakeResult(rows=self._history_rows)
        raise AssertionError(f"FakeSession이 모르는 쿼리다: {sql[:120]}")

    def add(self, instance: Any) -> None:
        self.ops.append(("add", instance))

    async def commit(self) -> None:
        self.ops.append(("commit", None))

    async def refresh(self, instance: Any) -> None:
        # 실서버에선 server_default=gen_random_uuid()가 채운 값을 여기서 읽어온다.
        if getattr(instance, "id", None) is None:
            instance.id = uuid.uuid4()
        self.ops.append(("refresh", instance))

    async def get(self, _model: Any, _primary_key: Any) -> Any:
        return self._wedding

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_exc_info: object) -> bool:
        return False

    @property
    def commit_count(self) -> int:
        return sum(1 for kind, _ in self.ops if kind == "commit")

    @property
    def added(self) -> list[Any]:
        return [obj for kind, obj in self.ops if kind == "add"]

    def op_names(self) -> list[str]:
        return [kind for kind, _ in self.ops]


def fake_session_factory(session: FakeSession) -> Callable[[], Callable[[], FakeSession]]:
    """app.services.chat.get_session_factory 대역.

    호출부가 `get_session_factory()()`로 두 번 호출한 뒤 `async with`로 쓰기 때문에
    팩토리→세션메이커→세션 3단을 그대로 흉내낸다.
    """

    def _get_factory() -> Callable[[], FakeSession]:
        def _make_session() -> FakeSession:
            return session

        return _make_session

    return _get_factory


class FakeGraph:
    """LangGraph 컴파일 결과 대역. astream이 낼 (mode, chunk) 조각을 스크립트로 받는다.

    스크립트 원소가 BaseException이면 그 지점에서 raise한다 — "이미 token을 몇 개 흘려보낸 뒤
    업스트림이 터진다"를 재현하기 위해서다. _finish_after_upstream_failure의 존재 이유가 정확히
    그 상황(답변은 이미 스트리밍됐는데 verify/재시도에서 실패)이다.
    """

    def __init__(self, script: Iterable[Any]) -> None:
        self._script = list(script)
        self.astream_calls = 0
        self.last_state: Any = None
        self.last_stream_mode: Any = None

    def astream(self, state: Any, config: Any = None, *, stream_mode: Any = None) -> Any:
        self.astream_calls += 1
        self.last_state = state
        self.last_stream_mode = stream_mode
        script = self._script

        async def _iterate() -> Any:
            for item in script:
                if isinstance(item, BaseException):
                    raise item
                yield item

        return _iterate()


class RecordedSpan:
    """traced_span 대역 — trace.update(...)에 무엇이 실렸는지 들여다본다.

    trace_id를 실제 값으로 주면 "span 블록 밖에서 trace.trace_id를 읽는" 구조(assistant_message.
    trace_ref)를 단언으로 고정할 수 있다. tests/test_chat_graph.py::_RecordedSpan과 같은 패턴이나,
    이쪽은 trace_id를 검증 대상으로 삼기 때문에 None이 아닌 값을 갖는다.
    """

    def __init__(self, name: str, calls: list[dict], trace_id: str | None) -> None:
        self._name = name
        self._calls = calls
        self.trace_id = trace_id

    def update(self, **kwargs: object) -> None:
        self._calls.append({"span_name": self._name, **kwargs})

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_exc_info: object) -> bool:
        return False


def recording_traced_span(calls: list[dict], *, trace_id: str | None = "trace-fake") -> Callable:
    def _factory(name: str, **_kwargs: object) -> RecordedSpan:
        return RecordedSpan(name, calls, trace_id)

    return _factory
