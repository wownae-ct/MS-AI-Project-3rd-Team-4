from unittest.mock import AsyncMock

import pytest

import app.agents.retriever.search as search_module
from app.agents.retriever.search import SpeechGuideMatch, search_speech_guide


class FakeConnection:
    def __init__(self, rows):
        self._rows = rows
        self.fetch_calls = []
        self.closed = False

    async def fetch(self, sql, *params):
        self.fetch_calls.append((sql, params))
        return self._rows

    async def close(self):
        self.closed = True


def _row(**overrides):
    # search_chunks_by_embedding의 실제 SELECT 컬럼(app/db/queries/speech_guide.py) 그대로 9개를
    # 기준으로 구성 — SpeechGuideMatch의 필드 목록을 기준으로 만들면 dataclass가 우연히 통과해버려
    # 컬럼명 어긋남(필드셋 드리프트)을 못 잡는다. 실제로 chunk_index 누락이 이 경로로 안 걸릴
    # 뻔했음.
    base = {
        "chunk_id": 1,
        "doc_id": 10,
        "chunk_text": "청크 본문",
        "chunk_index": 0,
        "title": "제목",
        "source_url": None,
        "source_note": "출처 텍스트",
        "category": "STAR",
        "distance": 0.12,
    }
    base.update(overrides)
    return base


@pytest.fixture(autouse=True)
def _settings_env(monkeypatch):
    # get_settings()는 lru_cache라 테스트 간 격리가 안 되면 실행 순서에 따라 결과가 달라진다 —
    # 매 테스트마다 필요한 env를 명시적으로 세팅하고 캐시를 비워서 순서 무관하게 만든다.
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost/db")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com")
    search_module.get_settings.cache_clear()
    yield
    search_module.get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _stub_embed_query(monkeypatch):
    stub = AsyncMock(return_value=[0.1, 0.2])
    monkeypatch.setattr(search_module, "embed_query", stub)
    return stub


@pytest.mark.asyncio
async def test_search_speech_guide_maps_rows_to_matches(_stub_embed_query):
    fake_conn = FakeConnection(rows=[_row()])
    fake_client = object()

    results = await search_speech_guide("두괄식이 뭐야", k=3, conn=fake_conn, client=fake_client)

    assert len(results) == 1
    match = results[0]
    assert isinstance(match, SpeechGuideMatch)
    assert match.chunk_id == 1
    assert match.chunk_index == 0
    assert match.source_note == "출처 텍스트"

    _stub_embed_query.assert_awaited_once()
    _, params = fake_conn.fetch_calls[0]
    assert params[-1] == 3  # k가 그대로 전달됐는지


@pytest.mark.asyncio
async def test_search_speech_guide_does_not_close_caller_provided_connection():
    fake_conn = FakeConnection(rows=[_row()])
    fake_client = object()

    await search_speech_guide("질의", conn=fake_conn, client=fake_client)

    # 호출자가 conn을 직접 넘겼으므로 search_speech_guide가 임의로 닫으면 안 됨
    assert fake_conn.closed is False


@pytest.mark.asyncio
async def test_search_speech_guide_defaults_k_from_settings(monkeypatch):
    fake_conn = FakeConnection(rows=[])
    fake_client = object()

    monkeypatch.setenv("RAG_SEARCH_DEFAULT_K", "9")
    search_module.get_settings.cache_clear()

    await search_speech_guide("질의", conn=fake_conn, client=fake_client)

    _, params = fake_conn.fetch_calls[0]
    assert params[-1] == 9
