"""RAG 코퍼스 색인: DS2_KCA~DS8_UGC(DS1_PRICE/DS7_TIMELINE 제외) chunk-ready JSON
(app.rag.corpus.load_corpus) → Azure OpenAI 임베딩 → rag_documents/rag_chunks 전체 재구성.

rag-reindex CronJob(infra/k8s/base/rag-cronjob/)이 `python -m app.rag.indexing`으로 실행한다.
코퍼스는 이미 청크 단위로 정제돼 있어(05_RAG_design.md §3, 10_RAG_data_catalog.md) 여기서
동적 청킹은 하지 않는다.

멱등성 전략: rag_documents/rag_chunks에는 자연키(unique 제약)가 없다(04_DB_spec.md §7 DDL).
chat_messages.citations는 chunk_id를 FK로 참조하지 않고 응답 시점에 title/source_tier/
source_url까지 JSONB로 스냅샷하므로, 재색인으로 chunk id가 바뀌어도 과거 응답에는 영향이 없다.
그래서 브리프코치가 썼던 자연키 ON CONFLICT upsert(backend/old/app/db/queries/speech_guide.py)
대신, 매 실행마다 전체 삭제 후 코퍼스 그대로 재삽입하는 단순한 전략을 쓴다 — 이 규모(수백 청크,
1일 1회 배치)에서 부분 동기화 로직은 과설계다(BASELINE §4).

rag_chunks.category_codes는 TEXT[](배열)이다(2026-08-21 결정) — 한 조각이 여러 카테고리에
걸치는 일반 자료(예: DS5_DUO 개요 조각)라면 코퍼스 JSON 자체에 이미 여러 값이 채워져 있으므로,
여기서는 그대로 옮겨 담기만 한다(행 복제·NULL 처리 둘 다 필요 없음)."""

import asyncio
import logging
from pathlib import Path

import tiktoken
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import get_session_factory
from app.core.embeddings import embed_texts, get_azure_openai_client
from app.models import RagChunk, RagDocument
from app.rag.corpus import ParsedDocument, load_corpus

logger = logging.getLogger(__name__)

_TOKEN_ENCODING = tiktoken.get_encoding("cl100k_base")


async def _embed_all(
    documents: list[ParsedDocument], settings: Settings
) -> list[list[list[float]]]:
    """문서별 청크를 하나의 배치로 임베딩한 뒤 문서별로 재분배한다. 문서마다 청크 개수가
    달라 오프셋 계산이 틀리면 A 문서 청크에 B 문서 임베딩이 조용히 섞이는 버그가 생길 수
    있어(backend/old/rag/index/assemble.py와 동일한 이유), 개수 불일치를 명시적으로 검증한다."""
    client = get_azure_openai_client(settings)
    # 문서 8개, 청크 140개를 전부 한 줄로 펼쳐서 "한 번에" 임베딩 API를 호출한다 — 문서마다
    # 따로따로 API를 부르면 요청 횟수가 늘어 느리고 비용도 더 든다(배치 처리).
    all_texts = [chunk.content for doc in documents for chunk in doc.chunks]
    all_embeddings = await embed_texts(
        client, all_texts, settings.azure_openai_embedding_deployment
    )
    if len(all_embeddings) != len(all_texts):
        raise ValueError(
            f"임베딩 개수 불일치: 청크 {len(all_texts)}개인데 임베딩 {len(all_embeddings)}개 반환됨"
        )

    # API가 돌려준 건 순서만 유지된 "한 줄 목록"이라, 다시 "문서별 묶음"으로 잘라 담아야 한다.
    # 문서 A가 청크 5개, 문서 B가 청크 3개라면 앞 5개는 A 것, 그다음 3개는 B 것 — offset을
    # 잘못 계산하면 A 청크에 B 임베딩이 조용히 섞여버리는 버그가 생긴다(위 docstring 참고).
    per_document: list[list[list[float]]] = []
    offset = 0
    for doc in documents:
        count = len(doc.chunks)
        per_document.append(all_embeddings[offset : offset + count])
        offset += count
    return per_document


async def _replace_all(
    session: AsyncSession,
    documents: list[ParsedDocument],
    embeddings_by_doc: list[list[list[float]]],
) -> tuple[int, int]:
    # rag_chunks.document_id는 ON DELETE CASCADE(04_DB_spec.md §7)라 rag_documents만 지워도
    # 자식 청크가 함께 정리된다.
    await session.execute(delete(RagDocument))

    chunk_count = 0
    for doc, embeddings in zip(documents, embeddings_by_doc, strict=True):
        document_row = RagDocument(
            dataset_code=doc.dataset_code,
            title=doc.title,
            source_tier=doc.source_tier,
            source_org=doc.source_org,
            source_url=doc.source_url,
            published_at=doc.published_at,
            license_note=doc.license_note,
            category_codes=doc.category_codes,
        )
        session.add(document_row)
        await session.flush()  # document_row.id 채번(자식 청크의 FK로 필요)

        for chunk, embedding in zip(doc.chunks, embeddings, strict=True):
            session.add(
                RagChunk(
                    document_id=document_row.id,
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    token_count=len(_TOKEN_ENCODING.encode(chunk.content)),
                    category_codes=chunk.category_codes,
                    item_type=chunk.item_type,
                    source_url=chunk.source_url,
                    embedding=embedding,
                )
            )
            chunk_count += 1

    await session.commit()
    return len(documents), chunk_count


async def reindex() -> None:
    """이 CronJob 전체의 진입점 — 매일 새벽 자동 실행된다. 코퍼스 JSON을 읽고(load_corpus) →
    전부 임베딩하고(_embed_all) → DB를 통째로 갈아끼운다(_replace_all), 딱 3단계.

    2026-08-26 레드팀 감사 4라운드 항목 12 — 전체에 로깅이 없어 실패하면 어느 단계에서
    죽었는지도 안 남고 pod만 죽었다. 각 단계마다 시작/완료를 남겨 최소한 어느 단계까지는
    성공했는지 pod 로그만으로 알 수 있게 한다(단계별 try/except는 안 씀 — 예외 자체는 이미
    스택트레이스와 함께 stderr로 전파돼 pod 로그에 남으므로, 여기서 또 잡았다 다시 던지는
    건 중복이라 YAGNI)."""
    settings = get_settings()
    logger.info("코퍼스 로드 시작: %s", settings.rag_corpus_path)
    documents = load_corpus(Path(settings.rag_corpus_path))
    logger.info("코퍼스 로드 완료: %d개 문서", len(documents))

    logger.info("임베딩 생성 시작")
    embeddings_by_doc = await _embed_all(documents, settings)
    logger.info("임베딩 생성 완료")

    async with get_session_factory()() as session:
        doc_count, chunk_count = await _replace_all(session, documents, embeddings_by_doc)

    # LOW 항목 — print()를 logger.info로.
    logger.info("indexed %d docs, %d chunks", doc_count, chunk_count)


if __name__ == "__main__":
    # main.py를 안 거치는 별도 진입점(rag-reindex CronJob이 `python -m app.rag.indexing`으로
    # 직접 실행)이라 app/main.py의 logging.basicConfig()가 안 돈다 — 여기서 따로 설정한다.
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    asyncio.run(reindex())
