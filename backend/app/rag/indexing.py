"""RAG 코퍼스 색인: data/rag_corpus/ 아래 모든 데이터셋(DS7_TIMELINE 제외 — 이건 RAG 코퍼스가
아니라 app/core/timeline_catalog.py 백엔드 상수로 별도 관리)의 chunk-ready JSON
(app.rag.corpus.load_corpus) → Azure OpenAI 임베딩 → rag_documents/rag_chunks 전체 재구성.
DS1_PRICE도 이 대상에 포함된다(2026-08-30 정정 — 이전 버전 이 docstring이 "DS1_PRICE 제외"라고
잘못 적어뒀었으나, load_corpus는 애초에 데이터셋 코드로 필터링하는 로직이 없어 실제로는 계속
포함되어 왔다. 아래 _embed_all의 "213개(DS1_PRICE 3청크 포함)" 주석과도 이제 일치한다).

DS8_UGC(Threads 실사용 후기)는 2026-08-30 코퍼스에서 제외했다 — 저작권 대응(원문 미저장,
사실만 재작성)은 되어 있었지만 개인정보보호법·사생활 리스크가 남아있었고, VENUE/SDM은 이미
다른 소스로 밀도가 높아(제외해도 각 87~89% 유지) 커버리지 손실이 미미해 리스크 대비 가치가
낮다고 판단했다(docs/AI-Sessions/wiki/decisions/2026-08-30-ds5-duo-ds8-ugc-corpus-retention-decision.md).
원본은 data/old/rag_corpus/DS8_UGC/에 보존.

DS5_DUO도 같은 날 뉴스 재유통 인용(businesskorea 1건, 2026년판만) 대신 duo.co.kr 원 보고서
2017/2021~2026년 7개년치(2018~2020은 평균 없이 최빈 가격구간만 있어 제외)로 갱신했다 —
원문 스크래핑본은 data/raw/DS5_DUO/*.txt에 보관, 코퍼스에는 여전히 숫자만 재작성해 반영
(license_note 참고). HOMENEW(신혼집) 카테고리는 이번에 처음 채워졌다.

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
from sqlalchemy import delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import get_session_factory
from app.core.embeddings import embed_texts, get_azure_openai_client
from app.models import RagChunk, RagDocument, RagIndexState
from app.rag.corpus import ParsedDocument, compute_corpus_hash, load_corpus

logger = logging.getLogger(__name__)

_TOKEN_ENCODING = tiktoken.get_encoding("cl100k_base")


async def _embed_all(
    documents: list[ParsedDocument], settings: Settings
) -> list[list[list[float]]]:
    """문서별 청크를 하나의 배치로 임베딩한 뒤 문서별로 재분배한다. 문서마다 청크 개수가
    달라 오프셋 계산이 틀리면 A 문서 청크에 B 문서 임베딩이 조용히 섞이는 버그가 생길 수
    있어(backend/old/rag/index/assemble.py와 동일한 이유), 개수 불일치를 명시적으로 검증한다."""
    client = get_azure_openai_client(settings)
    # 문서 14개, 청크 213개(2026-08-30 DS8_UGC 2개 문서/17청크 제외 + DS5_DUO 1개 문서/7청크를
    # 7개 문서/86청크로 교체 — 혼수 우선순위/신혼집 점유형태·유형 3종을 2021~2026년판에 추가한
    # 2차 보강분(18청크) 포함, 8개/134개에서 갱신, 위 모듈 docstring 참고)를 전부 한 줄로 펼쳐서
    # "한 번에" 임베딩 API를 호출한다 — 문서마다 따로따로 API를 부르면 요청 횟수가 늘어 느리고
    # 비용도 더 든다(배치 처리).
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


def _should_skip_reindex(current_hash: str, previous_hash: str | None) -> bool:
    """코퍼스 해시가 이전 색인 시점과 같으면 재색인을 건너뛴다. DB 세션도 임베딩 API도 안
    끌어오는 순수 비교라 이 판단 자체는 따로 유닛 테스트할 수 있다 — `previous_hash`가
    아직 없으면(최초 실행) 무조건 색인을 진행한다."""
    return previous_hash is not None and previous_hash == current_hash


async def _load_previous_corpus_hash(session: AsyncSession) -> str | None:
    state = await session.get(RagIndexState, 1)
    return state.corpus_hash if state else None


async def _record_index_state(
    session: AsyncSession, corpus_hash: str, doc_count: int, chunk_count: int
) -> None:
    state = await session.get(RagIndexState, 1)
    if state is None:
        state = RagIndexState(
            id=1,
            corpus_hash=corpus_hash,
            document_count=doc_count,
            chunk_count=chunk_count,
            indexed_at=func.now(),
        )
        session.add(state)
    else:
        state.corpus_hash = corpus_hash
        state.document_count = doc_count
        state.chunk_count = chunk_count
        state.indexed_at = func.now()
    await session.commit()


async def reindex() -> None:
    """이 CronJob 전체의 진입점 — 매일 새벽 자동 실행된다. 코퍼스 JSON을 읽고(load_corpus) →
    코퍼스가 실제로 바뀌었는지 확인하고(2026-08-30 스킵 가드) → 안 바뀌었으면 여기서 끝, 바뀌었으면
    전부 임베딩하고(_embed_all) → DB를 통째로 갈아끼운다(_replace_all).

    2026-08-30 — 코퍼스가 안 바뀐 날에도 이 스케줄이 매일 임베딩 API를 다시 부르고
    rag_documents/rag_chunks를 통째로 삭제·재삽입해왔다(비용은 미미하지만 순수하게 낭비).
    `data/rag_corpus/`가 실제로 바뀐 커밋에서만 재색인이 의미 있으므로, `compute_corpus_hash()`로
    "코퍼스 내용 자체"의 해시를 내서 `rag_index_state`(단일행)에 저장된 이전 값과 비교한다 —
    스케줄(매일 03시)은 그대로 두고 그 안에서 "할 일이 없는 실행"만 건너뛴다. CI에서
    `data/rag_corpus/**` diff를 보고 CronJob을 트리거하는 이벤트 기반 방식이 더 정교하겠지만,
    이 CronJob은 스케줄 트리거만 받을 수 있어(K8s CronJob 자체의 제약) 그 방식은 별도의
    파이프라인(예: GitHub Actions → K8s Job 생성)이 필요해 이 프로젝트 규모엔 과설계다 — 실행
    시점에 스스로 "할 일이 있는지" 판단하는 이 가드가 같은 효과를 훨씬 적은 인프라로 낸다.

    2026-08-26 레드팀 감사 4라운드 항목 12 — 전체에 로깅이 없어 실패하면 어느 단계에서
    죽었는지도 안 남고 pod만 죽었다. 각 단계마다 시작/완료를 남겨 최소한 어느 단계까지는
    성공했는지 pod 로그만으로 알 수 있게 한다(단계별 try/except는 안 씀 — 예외 자체는 이미
    스택트레이스와 함께 stderr로 전파돼 pod 로그에 남으므로, 여기서 또 잡았다 다시 던지는
    건 중복이라 YAGNI)."""
    settings = get_settings()
    corpus_root = Path(settings.rag_corpus_path)
    logger.info("코퍼스 로드 시작: %s", corpus_root)
    documents = load_corpus(corpus_root)
    logger.info("코퍼스 로드 완료: %d개 문서", len(documents))

    corpus_hash = compute_corpus_hash(corpus_root)
    async with get_session_factory()() as session:
        previous_hash = await _load_previous_corpus_hash(session)
    if _should_skip_reindex(corpus_hash, previous_hash):
        logger.info("코퍼스 변경 없음(hash=%s) — 재색인 건너뜀", corpus_hash[:12])
        return

    logger.info("임베딩 생성 시작")
    embeddings_by_doc = await _embed_all(documents, settings)
    logger.info("임베딩 생성 완료")

    async with get_session_factory()() as session:
        doc_count, chunk_count = await _replace_all(session, documents, embeddings_by_doc)
        await _record_index_state(session, corpus_hash, doc_count, chunk_count)

    # LOW 항목 — print()를 logger.info로.
    logger.info("indexed %d docs, %d chunks", doc_count, chunk_count)


if __name__ == "__main__":
    # main.py를 안 거치는 별도 진입점(rag-reindex CronJob이 `python -m app.rag.indexing`으로
    # 직접 실행)이라 app/main.py의 logging.basicConfig()가 안 돈다 — 여기서 따로 설정한다.
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    asyncio.run(reindex())
