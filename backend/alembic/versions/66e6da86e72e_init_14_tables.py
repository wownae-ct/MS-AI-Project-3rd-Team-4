"""init: 14 tables

DDL은 docs/wedding/plan/04_DB_spec.md §7 전문을 그대로 옮겼다(app/models/*.py의 SQLAlchemy
선언과 1:1 대응 — 이 리비전이 source of truth인 DDL 문서와 다이버전하지 않도록 autogenerate로
재작성하지 말고 여기서 직접 수정할 것).

Revision ID: 66e6da86e72e
Revises:
Create Date: 2026-08-20 18:12:38.953472

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "66e6da86e72e"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # pgcrypto는 안 쓴다 — gen_random_uuid()는 PostgreSQL 13부터 core 내장 함수라 확장이 필요
    # 없고(04_DB_spec.md §7 원문의 CREATE EXTENSION pgcrypto는 불필요), Azure Postgres Flexible
    # Server의 azure.extensions 허용목록에도 기본적으로 없어서 실제로 막힌다(실측 확인).
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute("""
        CREATE TABLE weddings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wedding_date DATE NOT NULL,
            total_budget BIGINT NOT NULL CHECK (total_budget > 0),
            region_code TEXT NOT NULL,
            guest_count INT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE categories (
            id SMALLINT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name_ko TEXT NOT NULL,
            display_order SMALLINT NOT NULL,
            tier TEXT NOT NULL CHECK (tier IN ('FOCUS','MOCKUP')),
            has_cost BOOLEAN NOT NULL,
            has_benchmark BOOLEAN NOT NULL,
            has_vendor_cases BOOLEAN NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE wedding_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
            category_id SMALLINT NOT NULL REFERENCES categories(id),
            is_active BOOLEAN NOT NULL DEFAULT true,
            planned_budget BIGINT NOT NULL DEFAULT 0 CHECK (planned_budget >= 0),
            skip_reason TEXT,
            display_order SMALLINT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (wedding_id, category_id)
        )
    """)
    op.execute("CREATE INDEX idx_wedding_categories_wedding ON wedding_categories(wedding_id)")

    op.execute("""
        CREATE TABLE checklist_items (
            id BIGSERIAL PRIMARY KEY,
            category_id SMALLINT NOT NULL REFERENCES categories(id),
            item_type TEXT NOT NULL CHECK (item_type IN ('CONTRACT_TERM','EXTRA_COST','PREP')),
            option_group TEXT,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            source_tier TEXT NOT NULL CHECK (source_tier IN ('OFFICIAL','NEWS','INDUSTRY','CONSENSUS')),
            source_label TEXT,
            source_url TEXT,
            default_dday_offset INT,
            display_order SMALLINT
        )
    """)
    op.execute(
        "CREATE INDEX idx_checklist_items_cat_type ON checklist_items(category_id, item_type)"
    )

    op.execute("""
        CREATE TABLE checklist_progress (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
            checklist_item_id BIGINT NOT NULL REFERENCES checklist_items(id),
            status TEXT NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO','DOING','DONE','SKIP')),
            memo TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (wedding_id, checklist_item_id)
        )
    """)

    op.execute("""
        CREATE TABLE payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
            category_id SMALLINT NOT NULL REFERENCES categories(id),
            item_name TEXT NOT NULL,
            payment_type TEXT NOT NULL CHECK (payment_type IN ('DEPOSIT','INTERIM','BALANCE','ETC')),
            amount BIGINT NOT NULL CHECK (amount > 0),
            due_date DATE,
            paid_date DATE,
            status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','PAID','CANCELED')),
            vendor_name TEXT,
            memo TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX idx_payments_wedding_cat_status ON payments(wedding_id, category_id, status)"
    )
    op.execute(
        "CREATE INDEX idx_payments_upcoming ON payments(wedding_id, due_date) WHERE status = 'PLANNED'"
    )

    op.execute("""
        CREATE TABLE milestone_templates (
            id SMALLSERIAL PRIMARY KEY,
            category_id SMALLINT REFERENCES categories(id),
            title TEXT NOT NULL,
            dday_offset_days INT NOT NULL,
            phase_label TEXT NOT NULL,
            display_order SMALLINT
        )
    """)
    op.execute(
        "CREATE INDEX idx_milestone_templates_offset ON milestone_templates(dday_offset_days)"
    )

    op.execute("""
        CREATE TABLE user_milestones (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
            template_id SMALLINT REFERENCES milestone_templates(id),
            category_id SMALLINT REFERENCES categories(id),
            title TEXT NOT NULL,
            target_date DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO','DONE')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX idx_user_milestones_wedding_date ON user_milestones(wedding_id, target_date)"
    )

    op.execute("""
        CREATE TABLE price_benchmarks (
            id BIGSERIAL PRIMARY KEY,
            survey_month DATE NOT NULL,
            region_code TEXT NOT NULL,
            category_code TEXT NOT NULL CHECK (category_code IN ('VENUE','SDM')),
            item_code TEXT NOT NULL,
            median_price BIGINT NOT NULL,
            min_price BIGINT,
            max_price BIGINT,
            sample_count INT,
            source_url TEXT NOT NULL,
            UNIQUE (survey_month, region_code, category_code, item_code)
        )
    """)

    op.execute("""
        CREATE TABLE vendor_case_examples (
            id BIGSERIAL PRIMARY KEY,
            category_id SMALLINT NOT NULL REFERENCES categories(id),
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
        "CREATE INDEX idx_vendor_cases_cat_type ON vendor_case_examples(category_id, case_type)"
    )

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

    op.execute("""
        CREATE TABLE chat_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
            category_id SMALLINT REFERENCES categories(id),
            title TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE chat_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('user','assistant')),
            content TEXT NOT NULL,
            citations JSONB,
            verification JSONB,
            latency_ms INT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX idx_chat_messages_session_time ON chat_messages(session_id, created_at)"
    )


def downgrade() -> None:
    for table in (
        "chat_messages",
        "chat_sessions",
        "rag_chunks",
        "rag_documents",
        "vendor_case_examples",
        "price_benchmarks",
        "user_milestones",
        "milestone_templates",
        "payments",
        "checklist_progress",
        "checklist_items",
        "wedding_categories",
        "categories",
        "weddings",
    ):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
