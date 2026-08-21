import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings


def _base_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost/db")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com")


def test_settings_parses_env(monkeypatch):
    _base_env(monkeypatch)
    monkeypatch.setenv("RAG_SEARCH_DEFAULT_K", "7")

    settings = Settings()

    assert settings.database_url == "postgresql://user:pass@localhost/db"
    assert settings.azure_openai_endpoint == "https://example.openai.azure.com"
    assert settings.rag_search_default_k == 7
    assert settings.database_auth_mode == "password"


def test_settings_defaults():
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("DATABASE_URL", "postgresql://user:pass@localhost/db")
        mp.setenv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com")
        settings = Settings()

    assert settings.azure_openai_embedding_deployment == "embedding"
    assert settings.rag_chunk_min_chars == 300
    assert settings.rag_chunk_max_chars == 500


def test_settings_missing_required_raises(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("AZURE_OPENAI_ENDPOINT", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_get_settings_is_cached(monkeypatch):
    _base_env(monkeypatch)
    get_settings.cache_clear()

    first = get_settings()
    second = get_settings()

    assert first is second
    get_settings.cache_clear()
