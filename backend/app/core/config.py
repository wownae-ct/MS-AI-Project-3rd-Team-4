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
    # infra/bicep/modules/openai.bicep의 실제 배포 이름(모델명 아님) — 05_RAG_design.md는
    # "gpt-4o-mini"로 서술하지만 실제 배포된 모델은 gpt-5.4-mini(배포 이름 chat-mini)다. Azure
    # OpenAI 호출은 배포 이름으로 하므로 실제 모델이 바뀌어도 이 값만 안 바뀌면 코드는 그대로다.
    azure_openai_chat_deployment: str = "chat-mini"
    azure_openai_embedding_deployment: str = "embedding"
    # TODO(재확인): 구현 시점에 실제 배포된 리소스/openai 패키지 버전과 다시 맞춰볼 것
    # (원래 브리프코치_기술설계서.md §8 미결 항목 — 문서는 docs/old/brief/plan/에 아카이브,
    # 메리맵 기술설계서에서 같은 항목 재확인 필요).
    azure_openai_api_version: str = "2024-10-21"

    # 05_RAG_design.md §4: 벡터 top-8 + tsvector top-4 → RRF 융합 → top-5 컨텍스트.
    rag_vector_top_k: int = 8
    rag_tsvector_top_k: int = 4
    rag_context_top_k: int = 5
    rag_rrf_k: int = 60

    # rag-reindex CronJob이 data/rag_corpus/를 이 경로에 마운트한다(infra/k8s/base/rag-cronjob/
    # cronjob.yaml: /app/data/rag_corpus, 컨테이너 WORKDIR이 /app이라 상대경로로 일치).
    rag_corpus_path: str = "data/rag_corpus"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
