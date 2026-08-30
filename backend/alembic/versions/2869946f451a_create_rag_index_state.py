"""create rag_index_state (reindex skip-guard)

2026-08-30 — rag-reindex CronJob(매일 03시)이 코퍼스가 안 바뀐 날에도 전체 삭제+재삽입+
임베딩 API 재호출을 반복하던 것을 막기 위한 상태 테이블. 마지막으로 실제 반영된 코퍼스의
해시(app/rag/corpus.py::compute_corpus_hash)를 여기 저장해두고, 다음 실행이 지금 코퍼스
해시와 비교해 같으면 재색인을 건너뛴다(app/rag/indexing.py::reindex). id=1 CHECK로 항상
한 행만 존재하게 강제한다.

Revision ID: 2869946f451a
Revises: a1c2e9f47d3b
Create Date: 2026-08-30 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2869946f451a"
down_revision: str | Sequence[str] | None = "a1c2e9f47d3b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE rag_index_state (
            id INTEGER PRIMARY KEY,
            corpus_hash TEXT NOT NULL,
            document_count INTEGER NOT NULL,
            chunk_count INTEGER NOT NULL,
            indexed_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT ck_rag_index_state_singleton CHECK (id = 1)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE rag_index_state")
