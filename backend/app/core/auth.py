"""Azure 인증 credential 캐싱. DefaultAzureCredential은 프로세스당 한 번만 만들어서
재사용한다 — 매 호출 새로 만들면 내부 토큰 캐싱이 무의미해진다. Postgres 연결(app/db/)과
Azure OpenAI 클라이언트(app/core/embeddings.py) 양쪽이 이 싱글턴을 공유한다."""

from functools import lru_cache

from azure.identity import DefaultAzureCredential
from azure.identity.aio import DefaultAzureCredential as AsyncDefaultAzureCredential


@lru_cache
def get_credential() -> DefaultAzureCredential:
    return DefaultAzureCredential()


@lru_cache
def get_async_credential() -> AsyncDefaultAzureCredential:
    """app/core/storage.py 전용 — Blob REST API를 httpx로 직접 호출할 때 쓰는 진짜 비동기
    credential(get_credential()의 동기 버전과 달리 get_token()이 이벤트 루프를 안 막는다).
    azure-identity 안에 이미 포함된 서브모듈이라 새 패키지가 아니다."""
    return AsyncDefaultAzureCredential()
