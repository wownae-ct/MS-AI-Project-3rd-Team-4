"""recreate vendor_case_examples v4.0

2026-08-24: v4.0 재설계(docs/wedding/plan/new/04_DB_schema.sql) 기준으로 vendor_case_examples를
새로 만든다. 7713273146d1에서 지운 뒤 재구현.

DDL 원본은 category_code를 category_code ENUM 타입으로 선언하지만(04_DB_schema.sql:257), 이
ENUM 타입은 카테고리 재설계를 진행 중인 다른 세션이 만들 예정이라 여기서 만들면 충돌한다. F10은
애초에 카테고리 개수·ENUM 상태와 무관하게 VENUE/SDM 2개로 고정된 규칙
(06_RAG_implementation_and_copyright_review.md §3)이므로, price_benchmarks가 이미 쓰는
TEXT+CHECK 패턴을 그대로 따라 이 테이블을 category ENUM 재설계와 완전히 독립시킨다.

Revision ID: 576130d068f7
Revises: 9acc4aa37be1
Create Date: 2026-08-24 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "576130d068f7"
down_revision: str | Sequence[str] | None = "9acc4aa37be1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE vendor_case_examples (
            id BIGSERIAL PRIMARY KEY,
            category_code TEXT NOT NULL CHECK (category_code IN ('VENUE','SDM')),
            case_type TEXT NOT NULL CHECK (case_type IN ('GOOD','BAD')),
            case_label TEXT NOT NULL,
            situation TEXT NOT NULL,
            key_lesson TEXT NOT NULL,
            related_item_type TEXT,
            source_tier TEXT NOT NULL CHECK (source_tier IN ('OFFICIAL','NEWS','INDUSTRY','CONSENSUS')),
            source_note TEXT,
            display_order SMALLINT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX idx_vendor_cases_cat_type ON vendor_case_examples(category_code, case_type)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS vendor_case_examples")
