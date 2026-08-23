"""Azure 인증 credential 캐싱. DefaultAzureCredential은 프로세스당 한 번만 만들어서
재사용한다 — 매 호출 새로 만들면 내부 토큰 캐싱이 무의미해진다. Postgres 연결(app/db/)과
Azure OpenAI 클라이언트(app/core/embeddings.py) 양쪽이 이 싱글턴을 공유한다."""

from functools import lru_cache

from azure.identity import DefaultAzureCredential


@lru_cache
def get_credential() -> DefaultAzureCredential:
    return DefaultAzureCredential()
