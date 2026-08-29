"""하이브리드 검색: 카테고리 하드필터 → (벡터 top-8 + tsvector top-4) → RRF 융합 → top-5 컨텍스트.

backend/old/app/agents/retriever/search.py(단일 pgvector top-k)를 대체 — 검색 대상 테이블
(rag_chunks)과 융합 로직(RRF) 자체가 다르므로 이식이 아니라 새로 작성한다(05_RAG_design.md §4,
계약조건(item_type='CONTRACT_TERM') 키워드 가중치는 같은 절 F9 참조).

카테고리 필터는 `category_codes @> ARRAY[:category_code]`(배열 포함 검색) — rag_chunks.category_codes
가 TEXT[]인 이유는 04_DB_spec.md (12) 참고.

category_code=None(카테고리 무관 전역 상담, 12_final_prototype_mockup.html 하단 탭바의
"AI상담")이면 `:category_code IS NULL OR ...`로 카테고리 필터 자체를 건너뛴다 — SQL의
`TRUE OR NULL = TRUE` 단축 평가 규칙 덕에 ARRAY[NULL]과의 @> 비교 결과(NULL/false)와 무관하게
안전하게 전체 카테고리를 대상으로 검색한다."""

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.embeddings import embed_query, get_azure_openai_client, to_pgvector_literal
from app.rag.query_profile import needs_contract_term_bonus

# F9: 질문이 이 키워드를 포함하면 계약조건(item_type='CONTRACT_TERM') 청크에 RRF 점수를 가산한다.
# 키워드 판별 자체(needs_contract_term_bonus)는 app/rag/query_profile.py로 옮겼다 — 트레이싱의
# 질의 태깅(contract_term_query)이 같은 판별을 재사용하기 때문. 가산 폭(RRF 점수 가중치)은
# 검색 랭킹 튜닝값이라 여기 그대로 둔다.
_CONTRACT_TERM_BONUS = 0.1


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: int
    content: str
    title: str
    source_tier: str
    source_url: str | None


_SEARCH_SQL = text("""
    -- ① "의미"로 찾기: 질문을 숫자 벡터로 바꾼 뒤(:query_embedding), 벡터끼리 거리가 가까운
    --   순으로 top-8(:vector_top_k)개를 뽑는다. "위약금"이라고 안 써도 "계약 취소 시 손해배상"처럼
    --   뜻이 비슷한 문장을 찾아낼 수 있다("코사인 거리" <=> 연산자, 값이 작을수록 더 비슷함).
    WITH vector_search AS (
        SELECT id, content, document_id, item_type, source_url,
               ROW_NUMBER() OVER (ORDER BY embedding <=> CAST(:query_embedding AS vector)) AS rank
        FROM rag_chunks
        -- category_code IS NULL이면(카테고리 무관 전역 상담) 이 필터를 건너뛰고 전체 카테고리를
        -- 대상으로 검색한다 — 아니면 지금 카테고리(예: VENUE) 밖 자료는 애초에 제외.
        WHERE CAST(:category_code AS TEXT) IS NULL
           OR category_codes @> ARRAY[CAST(:category_code AS TEXT)]
        ORDER BY embedding <=> CAST(:query_embedding AS vector)
        LIMIT :vector_top_k
    ),
    -- ② "단어"로 찾기: 질문에 실제로 들어있는 단어(예: "제3조", "10%")가 그대로 포함된 문서를
    --   top-4(:tsvector_top_k)개 뽑는다. 의미 검색이 놓치기 쉬운 "정확한 숫자·조항 번호" 매칭에 강함.
    keyword_search AS (
        SELECT id, content, document_id, item_type, source_url,
               ROW_NUMBER() OVER (
                   ORDER BY ts_rank(tsv, plainto_tsquery('simple', :query_text)) DESC
               ) AS rank
        FROM rag_chunks
        WHERE (CAST(:category_code AS TEXT) IS NULL
               OR category_codes @> ARRAY[CAST(:category_code AS TEXT)])
          AND tsv @@ plainto_tsquery('simple', :query_text)
        ORDER BY ts_rank(tsv, plainto_tsquery('simple', :query_text)) DESC
        LIMIT :tsvector_top_k
    ),
    -- ③ ①·② 두 순위표를 하나로 합친다(RRF, Reciprocal Rank Fusion). 공식은 "1 ÷ (상수 + 그
    --   목록에서의 순위)" — 순위가 낮은 숫자(=상위)일수록 점수가 커지고, 두 목록 모두에서
    --   상위권이면 점수가 두 번 더해져 최종 순위가 확 올라간다. 한쪽에만 나온 자료는 없는 쪽
    --   순위를 1000(사실상 "매우 하위")으로 쳐서 자연스럽게 낮은 점수를 받게 한다.
    --   여기에 "계약/위약금/해지" 같은 단어가 질문에 있으면(F9, :apply_contract_bonus) 계약
    --   조항(item_type='CONTRACT_TERM') 청크에 가산점(:contract_bonus)을 더 준다 — 계약 관련
    --   질문일 땐 법적 근거가 더 잘 뽑히도록 하는 튜닝이다.
    merged AS (
        SELECT
            COALESCE(v.id, k.id) AS id,
            COALESCE(v.content, k.content) AS content,
            COALESCE(v.document_id, k.document_id) AS document_id,
            COALESCE(v.source_url, k.source_url) AS source_url,
            (1.0 / (:rrf_k + COALESCE(v.rank, 1000)))
                + (1.0 / (:rrf_k + COALESCE(k.rank, 1000)))
                + CASE
                      WHEN :apply_contract_bonus
                           AND COALESCE(v.item_type, k.item_type) = 'CONTRACT_TERM'
                      -- 가산점 바인딩 파라미터는 바인딩 전엔 타입이 unknown이라, 이 THEN
                      -- 분기를 명시 캐스팅하지 않으면 Postgres가 ELSE 0(정수 리터럴)에 맞춰
                      -- 전체 CASE 타입을 integer로 추론해버려 0.1이 0으로 잘려나간다
                      -- (red-bug.md #22 — F9 계약조건 가산점이 배포 이래 한 번도 실제로
                      -- 반영된 적이 없었던 근본 원인, staging 실 DB로 재현·격리 완료).
                      THEN CAST(:contract_bonus AS double precision)
                      ELSE 0
                  END AS rrf_score
        FROM vector_search v
        FULL OUTER JOIN keyword_search k ON v.id = k.id
    )
    -- ④ 최종 점수 순으로 top-5(:context_top_k)만 골라, 어느 문서(rag_documents)에서 온 조각인지
    --   제목·출처등급까지 같이 붙여서 반환한다 — 이게 AI가 답변을 만들 때 보는 "근거 자료"가 된다.
    SELECT
        m.id AS chunk_id,
        m.content,
        d.title,
        d.source_tier,
        COALESCE(m.source_url, d.source_url) AS source_url
    FROM merged m
    JOIN rag_documents d ON d.id = m.document_id
    ORDER BY m.rrf_score DESC
    LIMIT :context_top_k
""")


# F10 업체사례(vendor_case_examples)와 DS2_KCA(분쟁조정 사례) 상호 링크 전용(2026-08-26) —
# app/services/vendor_case.py가 쓴다. DS2_KCA는 청크 2개뿐인 아주 얇은 코퍼스(RagDocument 1건)
# 라 retrieve()의 하이브리드(벡터+tsvector) 검색까지는 필요 없다 — 임베딩(Azure OpenAI 호출)
# 없이 tsvector 단독으로 충분하고, GET /vendor-cases처럼 페이지뷰마다 반복 호출되는 경로에
# 매번 임베딩 API를 새로 부르지 않아도 된다(이 기능은 LLM/임베딩 개입 없는 결정론적 연결이라는
# 설계 의도와도 맞는다, dev-e4 2026-08-26). `tsv @@ plainto_tsquery(...)` 조건으로 실제 단어
# 겹침이 없으면 0건을 반환한다 — 관련 없는 사례를 억지로 붙이지 않는다(§8 "새 통계 수치 창작
# 금지"와 같은 원칙: 근거 없는 연결을 지어내지 않는다).
_DS2_KCA_SEARCH_SQL = text("""
    SELECT
        c.id AS chunk_id,
        c.content,
        d.title,
        d.source_tier,
        COALESCE(c.source_url, d.source_url) AS source_url
    FROM rag_chunks c
    JOIN rag_documents d ON d.id = c.document_id
    WHERE d.dataset_code = 'DS2_KCA'
      AND c.category_codes @> ARRAY[CAST(:category_code AS TEXT)]
      AND c.tsv @@ plainto_tsquery('simple', :query_text)
    ORDER BY ts_rank(c.tsv, plainto_tsquery('simple', :query_text)) DESC
    LIMIT :top_k
""")


async def retrieve_ds2_kca_cases(
    session: AsyncSession,
    category_code: str,
    query_text: str,
    top_k: int = 1,
) -> list[RetrievedChunk]:
    result = await session.execute(
        _DS2_KCA_SEARCH_SQL,
        {"category_code": category_code, "query_text": query_text, "top_k": top_k},
    )
    return [
        RetrievedChunk(
            chunk_id=row.chunk_id,
            content=row.content,
            title=row.title,
            source_tier=row.source_tier,
            source_url=row.source_url,
        )
        for row in result
    ]


async def retrieve(
    session: AsyncSession,
    query: str,
    category_code: str | None,
    settings: Settings | None = None,
) -> list[RetrievedChunk]:
    settings = settings or get_settings()
    client = get_azure_openai_client(settings)
    # 사용자 질문 문장도 색인 때와 똑같은 방식으로 벡터로 바꿔야 "의미가 가까운지" 비교할 수 있다.
    query_embedding = await embed_query(client, query, settings.azure_openai_embedding_deployment)

    result = await session.execute(
        _SEARCH_SQL,
        {
            "query_embedding": to_pgvector_literal(query_embedding),
            "category_code": category_code,
            "query_text": query,
            "vector_top_k": settings.rag_vector_top_k,
            "tsvector_top_k": settings.rag_tsvector_top_k,
            "rrf_k": settings.rag_rrf_k,
            "context_top_k": settings.rag_context_top_k,
            "apply_contract_bonus": needs_contract_term_bonus(query),
            "contract_bonus": _CONTRACT_TERM_BONUS,
        },
    )
    return [
        RetrievedChunk(
            chunk_id=row.chunk_id,
            content=row.content,
            title=row.title,
            source_tier=row.source_tier,
            source_url=row.source_url,
        )
        for row in result
    ]
