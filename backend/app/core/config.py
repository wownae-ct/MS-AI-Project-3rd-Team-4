"""애플리케이션 런타임 설정. backend/app/core/__init__.py의 하위 모듈 — 다른 모든 모듈이 값이
필요하면 여기 Settings를 통해서만 읽는다(값을 직접 os.environ에서 읽지 않는다)."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    # 로컬 개발: DSN에 비밀번호 포함(db/migrate.py와 동일). 클러스터: AAD(Managed Identity) —
    # 비밀번호 없는 DSN + 연결 시점에 토큰을 password로 전달(app/db/__init__.py).
    database_auth_mode: Literal["password", "aad"] = "password"

    azure_openai_endpoint: str
    # infra/bicep/modules/openai.bicep의 실제 배포 이름(모델명 아님).
    azure_openai_embedding_deployment: str = "embedding"
    # TODO(재확인): 구현 시점에 실제 배포된 리소스/openai 패키지 버전과 다시 맞춰볼 것
    # (브리프코치_기술설계서.md §8 미결).
    azure_openai_api_version: str = "2024-10-21"

    rag_corpus_path: str = "data/rag_corpus/speech_guide_corpus.json"
    rag_chunk_min_chars: int = 300
    rag_chunk_max_chars: int = 500
    rag_search_default_k: int = 5

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
