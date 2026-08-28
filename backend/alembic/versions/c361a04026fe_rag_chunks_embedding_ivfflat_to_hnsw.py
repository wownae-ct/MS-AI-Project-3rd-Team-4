"""rag_chunks embedding ivfflat to hnsw

2026-08-26: rag_chunks.embedding의 벡터 인덱스를 ivfflat에서 HNSW로 바꾼다. 데이터(임베딩)는
그대로 두고 인덱스만 재생성하는 순수 DDL 변경 — 재색인/재적재 불필요.

배경: 초기 설계(66e6da86e72e, 614830d99cd2)는 코퍼스 규모(140청크)가 아주 작아 HNSW의
이점(대규모/증분 데이터에서의 리콜·속도 우위)이 실익이 없다고 보고 ivfflat을 골랐다(YAGNI).
이번 전환은 성능 문제 해결이 아니라 업계 표준(pgvector 0.5.0+ 기본 권장값)에 맞추기 위한
결정 — 라이브 DB 확인 결과 pgvector 0.8.2, Postgres 16.14로 HNSW를 완전히 지원해 확장
업그레이드나 Azure `azure.extensions` allowlist 조정이 전혀 필요 없다.

`app/rag/retrieval.py`의 검색 쿼리는 `ORDER BY embedding <=> :query_embedding`뿐이고
`SET ivfflat.probes` 같은 세션 GUC 튜닝이 없어 인덱스 타입 전환에 앱 코드 변경이 필요 없다.
빌드 파라미터는 pgvector 기본값(m=16, ef_construction=64)을 그대로 쓴다 — 이 규모에서
튜닝 실익이 없다(YAGNI).

Revision ID: c361a04026fe
Revises: 4e91220c0b77
Create Date: 2026-08-26 14:06:25.082328

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c361a04026fe"
down_revision: str | Sequence[str] | None = "4e91220c0b77"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_rag_chunks_embedding")
    op.execute(
        "CREATE INDEX idx_rag_chunks_embedding ON rag_chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_rag_chunks_embedding")
    op.execute(
        "CREATE INDEX idx_rag_chunks_embedding ON rag_chunks "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )
