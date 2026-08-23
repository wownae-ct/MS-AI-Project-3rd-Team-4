"""Azure OpenAI 클라이언트 + 임베딩 헬퍼. app/rag/indexing.py(오프라인 색인), app/rag/retrieval.py
(런타임 하이브리드 검색), app/rag/graph.py(채팅 생성·근거검증) 전부 여기서 클라이언트/함수를
가져다 쓴다(DRY) — 임베딩용/채팅용 Azure OpenAI 배포가 같은 리소스 아래 있어 클라이언트 생성
로직 자체는 공유해도 된다(infra/bicep/modules/openai.bicep)."""

from azure.identity import get_bearer_token_provider
from openai import AsyncAzureOpenAI

from app.core.auth import get_credential
from app.core.config import Settings
from app.core.tracing import resolve_azure_openai_class

AAD_OPENAI_SCOPE = "https://cognitiveservices.azure.com/.default"
EMBEDDING_BATCH_SIZE = 16


def get_azure_openai_client(settings: Settings) -> AsyncAzureOpenAI:
    token_provider = get_bearer_token_provider(get_credential(), AAD_OPENAI_SCOPE)
    # 트레이싱 활성화 시 langfuse.openai.AsyncAzureOpenAI(원본과 완전히 같은 클래스, 서브클래싱
    # 아님 — 14_langfuse_tracing_design.md §2)로 바뀐다. 이 한 곳만 바뀌면 두 그래프+retrieval+
    # indexing 전부 계측된다.
    client_cls = resolve_azure_openai_class(settings)
    return client_cls(
        azure_endpoint=settings.azure_openai_endpoint,
        azure_ad_token_provider=token_provider,
        api_version=settings.azure_openai_api_version,
    )


async def embed_texts(
    client: AsyncAzureOpenAI, texts: list[str], deployment: str
) -> list[list[float]]:
    if not texts:
        return []

    embeddings: list[list[float]] = []
    for start in range(0, len(texts), EMBEDDING_BATCH_SIZE):
        batch = texts[start : start + EMBEDDING_BATCH_SIZE]
        response = await client.embeddings.create(model=deployment, input=batch)
        # 응답 리스트 순서를 그대로 믿지 않고 item.index로 재정렬 — OpenAI 호환 embeddings API가
        # 입력 순서 보존을 보장은 하지만, index 필드가 있는 이상 그 필드로 재정렬하는 쪽이 API
        # 계약을 더 정확히 따르는 방어임(문서 단위 재조립과 같은 이유, rag/index/assemble.py 참고).
        ordered = sorted(response.data, key=lambda item: item.index)
        embeddings.extend(item.embedding for item in ordered)
    return embeddings


async def embed_query(client: AsyncAzureOpenAI, text: str, deployment: str) -> list[float]:
    return (await embed_texts(client, [text], deployment))[0]


def to_pgvector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(map(str, embedding)) + "]"
