"""app/rag/retrieval.py의 F9 계약조건 가산점(_CONTRACT_TERM_BONUS) 회귀 테스트 (red-bug.md #22).

PostgreSQL의 CASE 타입 통일 규칙 때문에 :contract_bonus(0.1, 바인딩 전 타입 unknown)가 ELSE
분기의 정수 리터럴 0에 맞춰 전체 CASE 타입이 integer로 강제변환되며 0으로 잘려나가던 버그 —
F9(계약/위약금/해지 키워드 질의에 CONTRACT_TERM 청크 가산)가 배포된 이래 한 번도 실제로
랭킹에 반영된 적이 없었다(red-bug.md 22번 상세/§22-1, staging 라이브 DB로 재현·격리 완료).
수정은 THEN 분기를 `CAST(:contract_bonus AS double precision)`으로 명시 캐스팅.

Tier A(빠른 타입 특성화 — 테이블/임베딩/Azure OpenAI 호출 불필요)와 Tier B(합성 rag_documents/
rag_chunks 픽스처로 retrieve() 종단간 순위 역전 검증, embed_query만 patch해 실 Azure 호출
회피, test_chat_graph.py와 같은 patch 패턴) 두 층위로 나눈다 — Tier A가 "타입이 다시
깨졌는지"를 가장 싸고 빠르게 잡고, Tier B가 실제 애플리케이션 코드 경로(_SEARCH_SQL 전체)가
옳은 순서를 반환하는지 보장한다."""

import math
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import delete, text

from app.core.config import Settings
from app.core.db import get_session_factory
from app.models import RagChunk, RagDocument
from app.rag.retrieval import retrieve

_EMBEDDING_DIM = 1536
# 실 코퍼스가 절대 안 쓰는 더미 카테고리 코드 — retrieval.py의 카테고리 하드필터
# (category_codes @> ARRAY[...])가 이 값으로 걸러주므로, 공유 dev DB에 이미 쌓여있는 151개
# 실 청크와 절대 안 섞인다(레포에 아직 테스트 DB 격리/롤백 인프라가 없어 실 DB에 대고 도는
# conftest.py 픽스처들과 같은 제약).
_TEST_CATEGORY_CODE = "TEST_ONLY_F9_CONTRACT_BONUS"


def _unit_vector(index: int) -> list[float]:
    vector = [0.0] * _EMBEDDING_DIM
    vector[index] = 1.0
    return vector


# 질의 벡터와 완전히 같은 방향(코사인 거리 0) — 벡터 검색에서 항상 1등이 되도록 고정.
_QUERY_EMBEDDING = _unit_vector(0)
# 질의 벡터와 직교(코사인 거리 1, 최대) — 벡터 검색에서 항상 꼴찌가 되도록 고정.
_ORTHOGONAL_EMBEDDING = _unit_vector(1)

# needs_contract_term_bonus("위약금")가 True를 반환하는 질의 — F9 가산점 조건을 켠다. 청크
# 본문엔 일부러 "위약금"을 넣지 않아 tsvector 키워드 검색이 양쪽 다 0건이 되게 해, 벡터 랭크 +
# 가산점만으로 순위가 갈리는 단순한 시나리오를 만든다(키워드 검색까지 걸리면 RRF 이중 가산
# 효과가 섞여 "가산점 자체의 효과"를 순수하게 분리해 보기 어려워진다).
_CONTRACT_QUERY = "위약금"

# retrieve_node가 config에 settings가 없으면 get_settings()로 폴백해 .env/환경변수에 의존하는
# 문제를 test_chat_graph.py와 같은 방식으로 피한다 — 필수 필드(기본값 없는 7개)만 채운 더미.
_TEST_SETTINGS = Settings(
    database_url="postgresql://test",
    azure_openai_endpoint="https://test.openai.azure.com",
    google_client_id="test",
    google_client_secret="test",
    naver_client_id="test",
    naver_client_secret="test",
    azure_storage_blob_endpoint="https://test.blob.core.windows.net",
)


class TestContractBonusCaseTypeCoercion:
    """Tier A — red-bug.md #22 격리 재현 SQL을 그대로 다시 실행해, 수정된 THEN 분기가 여전히
    double precision으로 뽑히는지 확인한다. 테이블이 전혀 필요 없어 CI/로컬 어디서나 빠르게
    돈다 — 이 CASE가 나중에 다시 깨지면(예: 다른 정수 분기가 하나 더 추가되며 재발하면) 가장
    먼저, 가장 싸게 잡아낸다."""

    async def test_case_result_type_is_double_precision(self) -> None:
        async with get_session_factory()() as session:
            result = await session.execute(
                text(
                    "SELECT pg_typeof("
                    "CASE WHEN :flag THEN CAST(:bonus AS double precision) ELSE 0 END"
                    ")"
                ),
                {"flag": True, "bonus": 0.1},
            )
            assert result.scalar_one() == "double precision"

    async def test_case_returns_the_bonus_value_uncorrupted(self) -> None:
        async with get_session_factory()() as session:
            result = await session.execute(
                text("SELECT CASE WHEN :flag THEN CAST(:bonus AS double precision) ELSE 0 END"),
                {"flag": True, "bonus": 0.1},
            )
            assert math.isclose(float(result.scalar_one()), 0.1, abs_tol=1e-9)


@pytest.fixture
async def contract_bonus_chunks() -> AsyncIterator[tuple[int, int]]:
    """Tier B용 합성 픽스처 — total_budget_benchmark/make_assistant_message(conftest.py)와
    동일한 컨벤션: insert 후 yield, 끝나면 넣은 행만 id로 추적해 명시 DELETE. yield하는 튜플은
    (non_contract_chunk_id, contract_chunk_id) 순서."""
    async with get_session_factory()() as session:
        document = RagDocument(
            dataset_code="TEST_ONLY",
            title="F9 가산점 회귀 테스트용 더미 문서",
            source_tier="CONSENSUS",
            category_codes=[_TEST_CATEGORY_CODE],
        )
        session.add(document)
        await session.flush()
        document_id = document.id

        # 벡터 검색 1등(질의와 코사인 거리 0)이지만 item_type이 CONTRACT_TERM이 아니라
        # 가산점 대상이 아닌 청크 — "가산점 없이 이미 이기고 있는 청크".
        non_contract_chunk = RagChunk(
            document_id=document_id,
            chunk_index=0,
            content="웨딩홀 대관료 평균 시세 안내.",
            category_codes=[_TEST_CATEGORY_CODE],
            item_type="EXTRA_COST",
            embedding=_QUERY_EMBEDDING,
        )
        # 벡터 검색 꼴찌(질의와 직교, 코사인 거리 1) — 가산점(0.1) 없이는 위 청크에 밀리지만,
        # F9 가산점이 실제로 반영되면(버그 수정 후) 역전돼 1등이 돼야 하는 청크.
        contract_chunk = RagChunk(
            document_id=document_id,
            chunk_index=1,
            content="웨딩홀 대관 계약서에 명시된 조항입니다.",
            category_codes=[_TEST_CATEGORY_CODE],
            item_type="CONTRACT_TERM",
            embedding=_ORTHOGONAL_EMBEDDING,
        )
        session.add_all([non_contract_chunk, contract_chunk])
        await session.commit()
        await session.refresh(non_contract_chunk)
        await session.refresh(contract_chunk)
        chunk_ids = (non_contract_chunk.id, contract_chunk.id)

    yield chunk_ids

    async with get_session_factory()() as session:
        await session.execute(delete(RagChunk).where(RagChunk.id.in_(chunk_ids)))
        await session.execute(delete(RagDocument).where(RagDocument.id == document_id))
        await session.commit()


class TestRetrieveAppliesContractTermBonusEndToEnd:
    """Tier B — retrieve() 전체 경로(_SEARCH_SQL 그대로)를 합성 픽스처로 태워, F9 가산점이
    실제로 순위를 뒤집는지 확인한다. embed_query만 patch해 실 Azure OpenAI 호출을 없앤다
    (test_chat_graph.py가 LLM 호출을 patch하는 것과 같은 패턴)."""

    async def test_contract_term_chunk_outranks_the_closer_vector_match(
        self, contract_bonus_chunks: tuple[int, int]
    ) -> None:
        non_contract_id, contract_id = contract_bonus_chunks
        with patch("app.rag.retrieval.embed_query", AsyncMock(return_value=_QUERY_EMBEDDING)):
            async with get_session_factory()() as session:
                chunks = await retrieve(
                    session, _CONTRACT_QUERY, _TEST_CATEGORY_CODE, settings=_TEST_SETTINGS
                )

        # 가산점이 죽어있던 예전 코드였다면 벡터 거리만으로 순위가 갈려 non_contract_id가
        # 1등이었을 것(수동 계산: rrf_k=60 기준 non_contract 0.01734 > contract 0.01707) —
        # 수정 후에는 가산점(0.1)이 그 차이를 압도해 contract_id가 1등이어야 한다.
        chunk_ids = [chunk.chunk_id for chunk in chunks]
        assert chunk_ids == [contract_id, non_contract_id]
