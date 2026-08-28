"""Azure 인증 credential 캐싱. DefaultAzureCredential은 프로세스당 한 번만 만들어서
재사용한다 — 매 호출 새로 만들면 내부 토큰 캐싱이 무의미해진다. Postgres 연결(app/db/)과
Azure OpenAI 클라이언트(app/core/embeddings.py) 양쪽이 이 싱글턴을 공유한다.

**2026-08-28 — `get_async_credential()`(`azure.identity.aio.DefaultAzureCredential`)을
제거했다.** `docs/wedding/refactor/red-bug.md` #8: 이 비동기 SDK의 `WorkloadIdentityCredential`
내부 트랜스포트가 `aiohttp`를 요구하는데 이미지에 `aiohttp`가 없어(2026-08-25 결정으로
`azure-storage-blob`/`aiohttp`를 뺐다) `POST /payments/receipt-extract`가 매번
`ModuleNotFoundError`로 500이 났다. Postgres 연결(`backend/old/app/db/__init__.py`,
pre-pivot 코드지만 같은 패턴)이 이미 `get_credential()`(동기, requests 기반, 로컬 `az
login`/AKS Workload Identity 양쪽 다 검증된 크리덴셜 체인)을 `asyncio.to_thread`로 감싸
이벤트 루프를 안 막으면서 쓰던 선례가 있다 — `app/core/storage.py`도 새 async SDK 대신 이
선례를 따르는 쪽이 새 의존성(aiohttp) 없이, 로컬/AKS 크리덴셜 체인 분기도 새로 안 짜고 고칠
수 있다."""

from functools import lru_cache

from azure.identity import DefaultAzureCredential


@lru_cache
def get_credential() -> DefaultAzureCredential:
    return DefaultAzureCredential()
