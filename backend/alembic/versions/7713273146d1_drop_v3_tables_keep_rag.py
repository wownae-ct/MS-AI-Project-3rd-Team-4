"""drop v3 tables, keep rag

2026-08-23: v4.0 재설계(docs/wedding/plan/new/, 00_BASELINE.md)가 새 SSOT로 승격되면서 기존
스키마를 기능 단위로 처음부터 다시 만들기로 했다. 재구현을 시작하기 전에 옛 테이블들을 정리한다.

RAG 2개(rag_documents/rag_chunks)만 남기고 나머지 12개 테이블을 전부 DROP한다:
  - weddings/wedding_categories/categories/payments/chat_sessions/chat_messages는 라이브 DB에서
    검증 세션 이후 정리돼 현재 0행(categories의 7행 시드는 예외, 아래 참고).
  - checklist_items/checklist_progress/price_benchmarks/vendor_case_examples/milestone_templates/
    user_milestones는 seed 스크립트 자체가 아직 없어 애초에 한 번도 채워진 적 없음(0행).
  - rag_documents/rag_chunks(8문서/140청크)는 Azure OpenAI 임베딩 비용이 들어간 실데이터라 유지.

drop 순서는 초기 스키마 리비전(66e6da86e72e)의 downgrade()가 이미 쓰던 것과 동일한 12개 테이블
목록에서 rag_documents/rag_chunks만 뺀 것 — CASCADE로 FK 순서 걱정 없이 안전하게 지운다.

이번 리비전은 모델/스키마/라우터/서비스 코드를 건드리지 않는다 — 각 기능을 v4.0 문서 기준으로
다시 만들 때(예: 참가격 스텝에서 price_benchmarks, 온보딩 스텝에서 weddings 등) 그 태스크에서
새 테이블/모델을 새로 만든다.

Revision ID: 7713273146d1
Revises: 614830d99cd2
Create Date: 2026-08-23 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7713273146d1"
down_revision: str | Sequence[str] | None = "614830d99cd2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_DROPPED_TABLES = (
    "chat_messages",
    "chat_sessions",
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
)

_CATEGORIES_TABLE = sa.table(
    "categories",
    sa.column("id", sa.SmallInteger),
    sa.column("code", sa.Text),
    sa.column("name_ko", sa.Text),
    sa.column("display_order", sa.SmallInteger),
    sa.column("tier", sa.Text),
    sa.column("has_cost", sa.Boolean),
    sa.column("has_benchmark", sa.Boolean),
    sa.column("has_vendor_cases", sa.Boolean),
)

_CATEGORIES_ROWS = [
    {
        "id": 1,
        "code": "MEETING",
        "name_ko": "상견례",
        "display_order": 0,
        "tier": "MOCKUP",
        "has_cost": False,
        "has_benchmark": False,
        "has_vendor_cases": False,
    },
    {
        "id": 2,
        "code": "VENUE",
        "name_ko": "예식장",
        "display_order": 1,
        "tier": "FOCUS",
        "has_cost": True,
        "has_benchmark": True,
        "has_vendor_cases": True,
    },
    {
        "id": 3,
        "code": "SDM",
        "name_ko": "스드메",
        "display_order": 2,
        "tier": "FOCUS",
        "has_cost": True,
        "has_benchmark": True,
        "has_vendor_cases": True,
    },
    {
        "id": 4,
        "code": "GIFT",
        "name_ko": "예물·예단",
        "display_order": 3,
        "tier": "MOCKUP",
        "has_cost": True,
        "has_benchmark": False,
        "has_vendor_cases": False,
    },
    {
        "id": 5,
        "code": "HOMEWARE",
        "name_ko": "혼수",
        "display_order": 4,
        "tier": "MOCKUP",
        "has_cost": True,
        "has_benchmark": False,
        "has_vendor_cases": False,
    },
    {
        "id": 6,
        "code": "INVITATION",
        "name_ko": "청첩장·답례품",
        "display_order": 5,
        "tier": "MOCKUP",
        "has_cost": True,
        "has_benchmark": False,
        "has_vendor_cases": False,
    },
    {
        "id": 7,
        "code": "HONEYMOON",
        "name_ko": "신혼여행",
        "display_order": 6,
        "tier": "MOCKUP",
        "has_cost": True,
        "has_benchmark": False,
        "has_vendor_cases": False,
    },
]


def upgrade() -> None:
    for table in _DROPPED_TABLES:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")


def downgrade() -> None:
    # 66e6da86e72e + 7e1bfc107dc7 + 2a23250a6ef0 세 리비전의 최종 결과물을 그대로 복원한다
    # (weddings는 2a23250a6ef0의 개인화 컬럼 5개를 처음부터 포함한 형태로 합쳐서 만든다).
    op.execute("""
        CREATE TABLE weddings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wedding_date DATE NOT NULL,
            total_budget BIGINT NOT NULL CHECK (total_budget > 0),
            region_code TEXT NOT NULL,
            guest_count INT,
            wedding_date_precision TEXT NOT NULL DEFAULT 'EXACT'
                CHECK (wedding_date_precision IN
                    ('EXACT','APPROX_H2_THIS_YEAR','APPROX_H1_NEXT_YEAR','APPROX_H2_NEXT_YEAR','NO_PLAN')),
            user_role TEXT NOT NULL CHECK (user_role IN ('BRIDE','GROOM')),
            taste_preference TEXT CHECK (taste_preference IN ('MINIMAL','BUDGET','GRAND','BALANCED')),
            venue_priority TEXT CHECK (venue_priority IN ('FOOD','LOCATION','PARKING','CAPACITY')),
            sdm_priority TEXT CHECK (sdm_priority IN ('DRESS','PHOTO','MAKEUP')),
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
    op.bulk_insert(_CATEGORIES_TABLE, _CATEGORIES_ROWS)

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
