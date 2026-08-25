"""Blob Storage 클라이언트 + 업로드 헬퍼. 영수증 OCR 자동채움(2026-08-25 결정, payments)의
원본 이미지 저장 전용 — infra/bicep/modules/storage.bicep의 receipts 컨테이너를 쓴다.
app/core/embeddings.py::get_azure_openai_client()와 동일한 인증 패턴(disableLocalAuth,
get_credential() 싱글턴 재사용)."""

import uuid

from azure.storage.blob.aio import BlobServiceClient

from app.core.auth import get_credential
from app.core.config import Settings


def get_blob_service_client(settings: Settings) -> BlobServiceClient:
    return BlobServiceClient(
        account_url=settings.azure_storage_blob_endpoint,
        credential=get_credential(),
    )


async def upload_receipt_image(
    client: BlobServiceClient,
    settings: Settings,
    wedding_id: uuid.UUID,
    content: bytes,
    content_type: str,
) -> str:
    """웨딩별로 UUID 파일명을 새로 발급해 업로드하고, 접근 가능한 blob URL을 반환한다.
    파일명에 원본 이름을 그대로 안 쓰는 이유: 사용자가 올린 파일명이 경로 구분자·제어문자를
    담고 있을 수 있어(경로 조작 방지), 서버가 발급한 값만 신뢰한다."""
    extension = _extension_for(content_type)
    blob_name = f"{wedding_id}/{uuid.uuid4()}{extension}"
    container_client = client.get_container_client(settings.azure_storage_receipts_container)
    blob_client = container_client.get_blob_client(blob_name)
    await blob_client.upload_blob(content, content_type=content_type, overwrite=False)
    return blob_client.url


_EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
}


def _extension_for(content_type: str) -> str:
    return _EXTENSION_BY_CONTENT_TYPE.get(content_type, "")
