"""rag_chunks category_code to array

2026-08-21: rag_documents/rag_chunks를 새 스키마로 다시 만든다.

  1) rag_chunks.category_code(TEXT, 값 1개)를 category_codes(TEXT[], 배열)로 바꾼다 — 한 조각이
     여러 카테고리에 걸치는 일반 자료(예: 정부 통계 보도자료)를 표현하려고 조각을 복사해 여러 행을
     만드는 대신, 라벨칸에 여러 값을 직접 담기로 했다. GIN 인덱스로 `category_codes @> ARRAY[:code]`
     (포함 여부) 질의를 지원한다.
  2) rag_chunks.source_url(TEXT, nullable)을 새로 추가한다 — 04_DB_spec.md (12)엔 이미 있던 컬럼인데
     실제 테이블에 반영이 안 돼 있었다(DS8_UGC처럼 청크마다 원문이 다른 데이터셋에 필요, todo.md
     §0-1에 기록된 갭). 이번에 같이 해소한다.

ALTER 대신 DROP+CREATE를 쓰는 이유: rag_documents/rag_chunks는 아직 seed도 안 됐고
`chat_messages.citations`가 chunk_id를 FK로 참조하지 않고 응답 시점에 내용을 JSONB로 통째로
스냅샷하므로(citation 데이터가 이미 비정규화돼 있음), 재색인 시 데이터가 통째로 바뀌어도 안전하다
(04_DB_spec.md §8 "Alembic 2개로 끝낸다" 원칙에서 벗어나 별도 리비전을 또 추가하는 것과 같은 이유로
2a23250a6ef0도 이미 이 원칙의 예외였다).

Revision ID: 614830d99cd2
Revises: 2a23250a6ef0
Create Date: 2026-08-21 14:04:06.133523

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "614830d99cd2"
down_revision: str | Sequence[str] | None = "2a23250a6ef0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 자식(rag_chunks) 먼저, FK 위반 없이 지운다.
    op.execute("DROP TABLE IF EXISTS rag_chunks")
    op.execute("DROP TABLE IF EXISTS rag_documents")

    op.execute("""
        CREATE TABLE rag_documents (
            id BIGSERIAL PRIMARY KEY,
            dataset_code TEXT NOT NULL,
            title TEXT NOT NULL,
            source_tier TEXT NOT NULL CHECK (source_tier IN ('OFFICIAL','NEWS','INDUSTRY','CONSENSUS')),
            source_org TEXT,
            source_url TEXT,
            published_at DATE,
            license_note TEXT,
            category_codes TEXT[],
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX idx_rag_documents_dataset ON rag_documents(dataset_code)")

    op.execute("""
        CREATE TABLE rag_chunks (
            id BIGSERIAL PRIMARY KEY,
            document_id BIGINT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
            chunk_index INT NOT NULL,
            content TEXT NOT NULL,
            token_count INT,
            category_codes TEXT[],
            item_type TEXT,
            source_url TEXT,
            embedding VECTOR(1536),
            tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED
        )
    """)
    op.execute(
        "CREATE INDEX idx_rag_chunks_embedding ON rag_chunks "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )
    op.execute("CREATE INDEX idx_rag_chunks_tsv ON rag_chunks USING GIN (tsv)")
    op.execute(
        "CREATE INDEX idx_rag_chunks_category_codes ON rag_chunks USING GIN (category_codes)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS rag_chunks")
    op.execute("DROP TABLE IF EXISTS rag_documents")

    op.execute("""
        CREATE TABLE rag_documents (
            id BIGSERIAL PRIMARY KEY,
            dataset_code TEXT NOT NULL,
            title TEXT NOT NULL,
            source_tier TEXT NOT NULL CHECK (source_tier IN ('OFFICIAL','NEWS','INDUSTRY','CONSENSUS')),
            source_org TEXT,
            source_url TEXT,
            published_at DATE,
            license_note TEXT,
            category_codes TEXT[],
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX idx_rag_documents_dataset ON rag_documents(dataset_code)")

    op.execute("""
        CREATE TABLE rag_chunks (
            id BIGSERIAL PRIMARY KEY,
            document_id BIGINT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
            chunk_index INT NOT NULL,
            content TEXT NOT NULL,
            token_count INT,
            category_code TEXT,
            item_type TEXT,
            embedding VECTOR(1536),
            tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED
        )
    """)
    op.execute(
        "CREATE INDEX idx_rag_chunks_embedding ON rag_chunks "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )
    op.execute("CREATE INDEX idx_rag_chunks_tsv ON rag_chunks USING GIN (tsv)")
    op.execute("CREATE INDEX idx_rag_chunks_category ON rag_chunks(category_code)")
