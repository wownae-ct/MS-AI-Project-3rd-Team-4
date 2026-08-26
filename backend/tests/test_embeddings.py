"""app/core/embeddings.py::get_azure_openai_client() — 2026-08-26 챗 SSE 타임아웃 회귀 수정.
클라이언트 생성자에 settings.azure_openai_timeout_seconds가 실제로 전달되는지만 확인한다
(그 값이 없으면 openai SDK 기본 600초가 그대로 적용돼 nginx ingress의 proxy-read-timeout보다
훨씬 오래 열려있을 수 있었다 — app/core/config.py 모듈 주석 참고). Azure/AAD 실호출은 전부
mock으로 대체한다."""

from unittest.mock import MagicMock, patch

from app.core.config import Settings
from app.core.embeddings import get_azure_openai_client

_TEST_SETTINGS = Settings(
    database_url="postgresql://test",
    azure_openai_endpoint="https://test.openai.azure.com",
    google_client_id="test",
    google_client_secret="test",
    naver_client_id="test",
    naver_client_secret="test",
    azure_storage_blob_endpoint="https://test.blob.core.windows.net",
)


class TestGetAzureOpenaiClient:
    def test_passes_configured_timeout_to_client_constructor(self):
        client_cls = MagicMock()
        with (
            patch("app.core.embeddings.get_credential", return_value=object()),
            patch("app.core.embeddings.get_bearer_token_provider", return_value=object()),
            patch("app.core.embeddings.resolve_azure_openai_class", return_value=client_cls),
        ):
            get_azure_openai_client(_TEST_SETTINGS)

        assert client_cls.call_args.kwargs["timeout"] == _TEST_SETTINGS.azure_openai_timeout_seconds

    def test_default_timeout_is_45_seconds(self):
        # PERSONALIZATION_TIMEOUT_MS(프론트, 45000ms)와 값을 맞춘 것 — app/core/config.py 참고.
        assert _TEST_SETTINGS.azure_openai_timeout_seconds == 45.0
