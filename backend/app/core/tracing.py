"""Langfuse LLM 관측/트레이싱. 14_langfuse_tracing_design.md. `langfuse`를 import하는 유일한
모듈 — 다른 곳은 이 모듈이 노출하는 함수만 쓴다.

이 프로젝트의 두 LangGraph(app/rag/graph.py, app/personalization/graph.py)는 LangChain
Runnable이 아니라 raw openai SDK를 직접 호출하므로, langfuse.langchain.CallbackHandler(LangChain
전용) 대신 OpenTelemetry 컨텍스트 전파를 그대로 이용한다: `traced_span()`으로 연 span이
contextvars를 통해 "현재 활성 span"이 되고, `app/core/embeddings.py::get_azure_openai_client()`가
반환하는 langfuse 계측 클라이언트가 그 안에서 호출되면 자동으로 자식 generation으로 붙는다 —
LangGraph 노드가 어떻게 스케줄되든(같은 태스크 내 await, 또는 asyncio.create_task) contextvars는
태스크 생성 시점에 복사되므로 계속 전파된다.

`langfuse.openai`의 계측은 서브클래싱이 아니라 wrapt로 openai SDK 메서드 자체를 전역
몽키패치한다(`from langfuse.openai import AsyncAzureOpenAI`는 원본 `openai.AsyncAzureOpenAI`와
완전히 같은 클래스 객체) — 그래서 `azure_ad_token_provider`(AAD 인증) 같은 생성자 kwarg가
그대로 통과하고, 이 프로젝트가 API 키 없이 Managed Identity만 쓰는 것과 아무 문제 없이 맞는다."""

import logging
from collections.abc import AsyncIterator
from contextlib import ExitStack, asynccontextmanager
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


def is_tracing_enabled(settings: Settings) -> bool:
    return bool(
        settings.langfuse_enabled and settings.langfuse_public_key and settings.langfuse_secret_key
    )


@lru_cache
def get_langfuse_client() -> Any | None:
    """인자 없음 — app/core/auth.py::get_credential()과 동일 컨벤션(그 함수도 인자 없는
    @lru_cache라 Settings를 캐시 키로 안 넘긴다). Settings는 frozen이 없는 평범한 pydantic
    모델이라 unhashable이므로, settings를 lru_cache 인자로 받으면 TypeError가 난다.

    이 함수가 반환하는 인스턴스는 langfuse 라이브러리 내부의 프로세스 전역 레지스트리
    (LangfuseResourceManager, public_key 단위 싱글턴)에도 자동 등록된다 — 이 프로젝트는 프로젝트
    1개만 쓰므로 이후 langfuse.openai가 몽키패치한 openai 메서드 안에서 호출하는
    langfuse.get_client()가 이 인스턴스를 그대로 찾아 쓴다. 이게 성립하려면 실제 LLM 호출보다
    먼저 이 함수가 최소 한 번 불려야 하는데, resolve_azure_openai_class()가 활성 분기에서 이
    함수를 먼저 호출해 그 순서를 보장한다."""
    settings = get_settings()
    if not is_tracing_enabled(settings):
        return None
    from langfuse import Langfuse

    return Langfuse(
        public_key=settings.langfuse_public_key,
        secret_key=settings.langfuse_secret_key,
        host=settings.langfuse_host,
        environment=settings.langfuse_environment,
    )


def resolve_azure_openai_class(settings: Settings) -> type:
    """app/core/embeddings.py::get_azure_openai_client()가 이 함수로 클라이언트 클래스만
    바꿔치기한다 — 두 그래프 + retrieval + indexing 전부 이 한 곳을 거치므로 계측이 한 번에
    적용된다."""
    if is_tracing_enabled(settings):
        # get_langfuse_client()를 먼저 호출해 싱글턴을 등록해둔다 — 안 그러면 langfuse.openai가
        # 몽키패치한 메서드가 첫 LLM 호출 시 langfuse.get_client()로 등록된 인스턴스가 없다고
        # 판단해 env var 기반의 엉뚱한 기본 인스턴스를 새로 만들 수 있다.
        get_langfuse_client()
        from langfuse.openai import AsyncAzureOpenAI

        return AsyncAzureOpenAI
    from openai import AsyncAzureOpenAI

    return AsyncAzureOpenAI


@dataclass
class TraceHandle:
    trace_id: str | None
    _span: Any = None

    def update(self, **kwargs: Any) -> None:
        if self._span is not None:
            self._span.update(**kwargs)


@asynccontextmanager
async def traced_span(
    name: str,
    *,
    settings: Settings,
    input: Any = None,  # Langfuse SDK 파라미터명을 그대로 따름(builtin input 가림, 이 파일 밖에선 안 씀)
    metadata: dict[str, Any] | None = None,
    session_id: str | None = None,
    user_id: str | None = None,
    tags: list[str] | None = None,
) -> AsyncIterator[TraceHandle]:
    """비활성이면 trace_id=None인 no-op 핸들을 즉시 yield한다 — 활성/비활성이 동일 인터페이스라
    호출부에 if 분기가 새지 않는다. session_id/user_id/tags는 진입점(run_personalization/
    stream_chat_response)에서만 넘긴다 — 그래프 내부 자식 span은 생략해도 컨텍스트 전파로
    자동 상속된다(langfuse.propagate_attributes 문서 — 트레이스 레벨 속성은 루트에서 한 번만
    설정하면 됨). tags는 app/rag/query_profile.py가 분류한 질의 품질 리스크 패턴(예:
    short_query)을 트레이스 목록에서 바로 필터링할 수 있게 하려는 용도 — Langfuse 대시보드
    위젯은 커스텀 메타데이터를 차원으로 못 쓰지만(2026-08-24-langfuse-tracing-completion.md
    §"한계"), 네이티브 tags는 트레이스 목록 필터에서 직접 지원된다."""
    if not is_tracing_enabled(settings):
        yield TraceHandle(trace_id=None)
        return

    client = get_langfuse_client()
    assert client is not None  # is_tracing_enabled()가 참이면 항상 생성됨

    try:
        stack = ExitStack()
        span = stack.enter_context(
            client.start_as_current_observation(
                name=name, as_type="span", input=input, metadata=metadata
            )
        )
        if session_id is not None or user_id is not None or tags:
            from langfuse import propagate_attributes

            stack.enter_context(
                propagate_attributes(user_id=user_id, session_id=session_id, tags=tags)
            )
    except Exception:
        # 막으면 안 된다. 이 트라이는 "span을 여는" 설정 단계만 감싼다 — 아래 yield 이후
        # 호출부(async with 블록) 안에서 발생하는 예외는 여기서 안 잡고 그대로 전파시킨다.
        # 2026-08-26 레드팀 감사 4라운드 항목 11 — 이 실패를 완전 무음으로 삼키고 no-op으로
        # 대체했다. 레드팀 감사 3라운드가 찾은 "LLM 실패 턴도 trace가 비어있다"의 실제 원인이
        # 바로 이 지점이라, 최소한 로그는 남겨야 Langfuse trace가 비어 있는 이유(전송 실패
        # 자체 vs. 이 span-open 실패)를 구분할 수 있다.
        logger.exception("Failed to start Langfuse span %r — tracing disabled for this call", name)
        yield TraceHandle(trace_id=None)
        return

    try:
        yield TraceHandle(trace_id=span.trace_id, _span=span)
    finally:
        stack.close()


def flush_tracing(settings: Settings) -> None:
    if not is_tracing_enabled(settings):
        return
    client = get_langfuse_client()
    if client is not None:
        client.flush()


def score_trace(
    trace_id: str,
    *,
    name: str,
    value: float,
    data_type: str = "BOOLEAN",
    comment: str | None = None,
    score_id: str | None = None,
) -> None:
    """Langfuse 트레이스에 사용자 평가 점수를 붙인다. 트레이싱이 꺼져 있으면(get_langfuse_client()가
    None을 반환하면) 아무것도 하지 않는다 — traced_span/flush_tracing과 동일한 no-op 컨벤션이라
    호출부에 if 분기가 새지 않는다.

    v4 SDK의 client.create_score()를 쓴다(레거시 v2 client.score()가 아님, 실 소스로 시그니처
    확인). create_score()는 동기 호출이지만 내부적으로 백그라운드 큐에 이벤트를 적재만 하고
    즉시 반환한다(langfuse/_client/client.py 실측 — self._resources.add_score_task) — 블로킹
    네트워크 호출이 아니므로 asyncio.to_thread로 감쌀 필요가 없다. score_id를 주면 같은
    메시지를 여러 번 평가해도(app/services/chat.py::rate_chat_message) 스코어 행이 계속
    쌓이지 않고 갱신된다. create_score() 자체가 내부에서 예외를 잡아 로깅만 하고 삼키므로
    (SDK 소스 확인) 이 함수도 추가로 예외를 던지지 않는다."""
    client = get_langfuse_client()
    if client is None:
        return
    client.create_score(
        trace_id=trace_id,
        name=name,
        value=value,
        data_type=data_type,
        comment=comment,
        score_id=score_id,
    )
