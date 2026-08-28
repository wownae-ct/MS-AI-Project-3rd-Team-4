"""[F10] vendor_case_examples 조회 로직. 03_API_spec.md #24,
06_RAG_implementation_and_copyright_review.md §3.

F10은 VENUE/SDM에만 적용되는 고정 규칙(카테고리 개수·ENUM 재설계와 무관)이라, 이 모듈은
category ENUM/categories 테이블 상태를 전혀 참조하지 않는다 — 다른 세션이 진행 중인 auth/카테고리
재구현과 독립적으로 완결되도록, wedding_id/세션 정보 없이 category_code+case_type만으로
동작한다(price_benchmarks의 app/services/benchmark.py와 같은 설계 이유)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import VendorCaseExample
from app.rag.retrieval import retrieve_ds2_kca_cases
from app.schemas.chat import CitationOut

FOCUS_CATEGORIES: frozenset[str] = frozenset({"VENUE", "SDM"})

DISCLAIMER = "아래 사례는 여러 실제 사례를 재구성한 예시이며 특정 업체를 지칭하지 않습니다."

# top_k=1 — DS2_KCA가 청크 2개뿐인 코퍼스라(app/rag/retrieval.py::retrieve_ds2_kca_cases
# 주석 참고) 카드 하나에 여러 개를 붙일 만큼의 양 자체가 없다.
_DS2_RELATED_CASE_TOP_K = 1


async def related_ds2_cases(
    session: AsyncSession, category_code: str, situation: str, key_lesson: str
) -> list[CitationOut]:
    """F10 업체사례(팀이 재구성한 예시 카드)에 실제 공식 분쟁조정 사례(DS2_KCA) 근거를 붙인다.
    situation+key_lesson 텍스트로 DS2_KCA만 검색하고(LLM/임베딩 개입 없음), 실제로 겹치는
    단어가 없으면 빈 리스트를 그대로 반환한다 — 관련 없는 사례를 억지로 연결하지 않는다."""
    query_text = f"{situation} {key_lesson}"
    chunks = await retrieve_ds2_kca_cases(
        session, category_code, query_text, top_k=_DS2_RELATED_CASE_TOP_K
    )
    return [
        CitationOut(
            chunk_id=c.chunk_id, title=c.title, source_tier=c.source_tier, source_url=c.source_url
        )
        for c in chunks
    ]


async def list_vendor_cases(
    session: AsyncSession,
    category_code: str,
    case_type: str | None = None,
) -> list[VendorCaseExample]:
    """category_code가 FOCUS_CATEGORIES 밖이면 빈 목록을 반환한다 — "제공 안 함" 404 판단은
    라우터가 FOCUS_CATEGORIES로 먼저 하고, 이 함수는 순수 조회만 맡는다."""
    stmt = select(VendorCaseExample).where(VendorCaseExample.category_code == category_code)
    if case_type is not None:
        stmt = stmt.where(VendorCaseExample.case_type == case_type)
    stmt = stmt.order_by(VendorCaseExample.display_order)
    return list((await session.execute(stmt)).scalars().all())
