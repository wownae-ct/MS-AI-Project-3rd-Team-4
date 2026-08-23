"""app/core/tracing.py — 순수 함수/비활성 경로만(DB·실LLM 없이 도는 것). 활성 경로(실제 Langfuse
전송)는 14_langfuse_tracing_design.md §6의 실DB+실API 검증으로 확인한다(이 레포 컨벤션: DB/외부
API 관련은 모킹 없이 수동 검증)."""

import pytest
from openai import AsyncAzureOpenAI

from app.core.config import Settings
from app.core.tracing import (
    TraceHandle,
    get_langfuse_client,
    is_tracing_enabled,
    resolve_azure_openai_class,
    traced_span,
)


def _make_settings(**overrides) -> Settings:
    defaults = {
        "database_url": "postgresql://x",
        "azure_openai_endpoint": "https://x",
    }
    defaults.update(overrides)
    return Settings(**defaults)


class TestIsTracingEnabled:
    def test_disabled_by_default(self):
        assert is_tracing_enabled(_make_settings()) is False

    def test_enabled_flag_alone_is_not_enough_without_keys(self):
        settings = _make_settings(langfuse_enabled=True)
        assert is_tracing_enabled(settings) is False

    def test_enabled_with_both_keys_present(self):
        settings = _make_settings(
            langfuse_enabled=True,
            langfuse_public_key="pk-lf-x",
            langfuse_secret_key="sk-lf-x",
        )
        assert is_tracing_enabled(settings) is True

    def test_keys_present_but_flag_off(self):
        settings = _make_settings(
            langfuse_enabled=False,
            langfuse_public_key="pk-lf-x",
            langfuse_secret_key="sk-lf-x",
        )
        assert is_tracing_enabled(settings) is False


class TestResolveAzureOpenaiClass:
    def test_disabled_returns_plain_openai_class(self):
        assert resolve_azure_openai_class(_make_settings()) is AsyncAzureOpenAI


class TestGetLangfuseClient:
    def test_no_args_no_typeerror(self):
        # 회귀 방지: get_langfuse_client(settings)처럼 lru_cache 인자로 Settings를 받으면
        # Settings가 frozen 없는 평범한 pydantic 모델이라 unhashable이라 TypeError가 난다.
        # get_credential()과 동일하게 인자 없이 호출 가능해야 한다.
        client = get_langfuse_client()
        assert client is None  # 이 레포의 실제 .env는 기본적으로 트레이싱 off


class TestTracedSpan:
    async def test_disabled_yields_noop_handle_without_error(self):
        async with traced_span("test", settings=_make_settings()) as trace:
            assert isinstance(trace, TraceHandle)
            assert trace.trace_id is None

    async def test_disabled_update_is_noop(self):
        async with traced_span("test", settings=_make_settings()) as trace:
            trace.update(output="x")  # 예외 없이 조용히 무시돼야 함

    async def test_body_exception_propagates(self):
        with pytest.raises(ValueError, match="boom"):
            async with traced_span("test", settings=_make_settings()):
                raise ValueError("boom")
