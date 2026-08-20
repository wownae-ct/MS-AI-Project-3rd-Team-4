"""RAG 코퍼스 색인: DS1_PRICE~DS8_UGC 원본 → 청킹 → Azure OpenAI 임베딩 → rag_documents/rag_chunks upsert.

rag-reindex CronJob(infra/k8s/base/rag-cronjob/)이 `python -m app.rag.indexing`으로 실행한다.
청킹 전략은 backend/old/rag/index/chunker.py의 tiktoken 기반 접근을 참고하되, 카테고리별 청킹
단위(문단/조문/섹션/항목)가 데이터셋마다 다르므로 그대로 재사용하지 않고 새로 작성한다
(05_RAG_design.md §3, 09_backend_implementation_plan.md Phase 3)."""


async def reindex() -> None:
    raise NotImplementedError


if __name__ == "__main__":
    import asyncio

    asyncio.run(reindex())
