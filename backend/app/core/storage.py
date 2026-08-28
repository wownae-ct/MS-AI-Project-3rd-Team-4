"""Blob Storage 업로드 헬퍼. 영수증 OCR 자동채움(2026-08-25 결정, payments)의 원본 이미지
저장 전용 — infra/bicep/modules/storage.bicep의 receipts 컨테이너를 쓴다.

azure-storage-blob SDK를 안 쓴다 — 이 레포는 외부 REST 호출에 이미 httpx를 쓰고 있고
(app/services/oauth.py), azure-core에는 aiohttp/requests(스레드풀 우회, 진짜 async 아님)
기반 transport만 있고 httpx transport가 없다. Put Blob은 단일 PUT 요청 하나로 끝나는 단순한
연산이라, SDK 대신 REST API를 httpx로 직접 호출하는 쪽이 새 의존성(azure-storage-blob,
aiohttp) 없이 oauth.py와 동일한 패턴을 유지한다.

**2026-08-28 — 토큰 발급도 `get_credential()`(동기) + `asyncio.to_thread`로 바꿨다**
(`docs/wedding/refactor/red-bug.md` #8). 원래는 `get_async_credential()`(`azure.identity.aio`)
을 썼는데, 그 SDK의 `WorkloadIdentityCredential` 내부 트랜스포트가 `aiohttp`를 요구해서(이미지에
없음) 이 함수가 호출될 때마다 `ModuleNotFoundError`로 500이 났다 — 위 문단의 "새 의존성 없이"
원칙을 Blob PUT만 지키고 토큰 발급은 놓친 게 이 버그의 원인. `get_credential()`은 이미 Postgres
연결(`app/core/db.py`)이 같은 `asyncio.to_thread` 패턴으로 로컬(`az login`)·AKS(Workload
Identity) 양쪽에서 검증된 크리덴셜이라, 여기서도 그대로 재사용한다."""

import asyncio
import uuid
from datetime import UTC, datetime

import httpx

from app.core.auth import get_credential
from app.core.config import Settings

_STORAGE_SCOPE = "https://storage.azure.com/.default"
_BLOB_API_VERSION = "2024-11-04"
_HTTP_TIMEOUT_SECONDS = 30.0


async def upload_receipt_image(
    settings: Settings,
    wedding_id: uuid.UUID,
    content: bytes,
    content_type: str,
) -> str:
    """웨딩별로 UUID 파일명을 새로 발급해 업로드하고, 접근 가능한 blob URL을 반환한다.
    파일명에 원본 이름을 그대로 안 쓰는 이유: 사용자가 올린 파일명이 경로 구분자·제어문자를
    담고 있을 수 있어(경로 조작 방지), 서버가 발급한 값만 신뢰한다.
    Put Blob(단일 요청, ≤5000MiB) — 이 기능의 15MB 상한을 훨씬 웃돌아 청크 업로드가 불필요."""
    token_result = await asyncio.to_thread(get_credential().get_token, _STORAGE_SCOPE)
    blob_name = f"{wedding_id}/{uuid.uuid4()}{_extension_for(content_type)}"
    blob_url = (
        f"{settings.azure_storage_blob_endpoint.rstrip('/')}/"
        f"{settings.azure_storage_receipts_container}/{blob_name}"
    )
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as http_client:
        response = await http_client.put(
            blob_url,
            content=content,
            headers={
                "Authorization": f"Bearer {token_result.token}",
                "x-ms-version": _BLOB_API_VERSION,
                "x-ms-blob-type": "BlockBlob",
                "x-ms-date": datetime.now(UTC).strftime("%a, %d %b %Y %H:%M:%S GMT"),
                "Content-Type": content_type,
            },
        )
        response.raise_for_status()
    return blob_url


_EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
}


def _extension_for(content_type: str) -> str:
    return _EXTENSION_BY_CONTENT_TYPE.get(content_type, "")
