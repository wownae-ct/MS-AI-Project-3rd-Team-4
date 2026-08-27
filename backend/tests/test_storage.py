"""app/core/storage.py — Blob 업로드 헬퍼. docs/wedding/refactor/red-bug.md #8 회귀 테스트:
get_async_credential()(azure.identity.aio, 내부적으로 aiohttp 필요)를 get_credential()
(동기) + asyncio.to_thread로 바꾼 수정이 실제로 동작하는지 확인한다 — 옛 코드였다면 이
테스트가 get_async_credential() 호출 시점(자체가 아니라 그 생성자 내부의 WorkloadIdentityCredential
초기화)에 ModuleNotFoundError로 죽었을 것이다. httpx/credential 모킹은 test_chat_graph.py가
세운 선례(MagicMock + AsyncMock)를 따른다."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.core.storage import upload_receipt_image


def _fake_settings() -> SimpleNamespace:
    return SimpleNamespace(
        azure_storage_blob_endpoint="https://fakestorage.blob.core.windows.net",
        azure_storage_receipts_container="receipts",
    )


class TestUploadReceiptImage:
    async def test_uploads_via_sync_credential_without_aiohttp(self):
        wedding_id = uuid4()
        fake_token = MagicMock(token="fake-access-token")
        fake_credential = MagicMock()
        fake_credential.get_token.return_value = fake_token
        fake_response = MagicMock()
        fake_response.raise_for_status = MagicMock()

        with (
            patch("app.core.storage.get_credential", return_value=fake_credential),
            patch("httpx.AsyncClient.put", new=AsyncMock(return_value=fake_response)) as mock_put,
        ):
            blob_url = await upload_receipt_image(
                _fake_settings(), wedding_id, b"fake-image-bytes", "image/jpeg"
            )

        assert blob_url.startswith(
            f"https://fakestorage.blob.core.windows.net/receipts/{wedding_id}/"
        )
        assert blob_url.endswith(".jpg")
        fake_credential.get_token.assert_called_once_with("https://storage.azure.com/.default")
        mock_put.assert_awaited_once()
        _, kwargs = mock_put.call_args
        assert kwargs["headers"]["Authorization"] == "Bearer fake-access-token"
        assert kwargs["content"] == b"fake-image-bytes"
