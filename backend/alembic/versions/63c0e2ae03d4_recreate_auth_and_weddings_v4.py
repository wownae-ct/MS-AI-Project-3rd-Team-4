"""recreate auth and weddings v4.0

2026-08-23~24: v4.0 인증 재도입(00_BASELINE.md ①) + weddings/wedding_categories 재구현.
7713273146d1에서 지운 뒤 두 번째 재구현 조각 — auth+weddings 태스크 범위(users/auth_sessions/
weddings/wedding_categories + category_code ENUM 타입).

**이번 리비전에 의도적으로 안 넣은 것**: timeline_items, ai_invocations, feedback_reports,
checklist_items, payments, chat_sessions/chat_messages — 전부 weddings.id를 참조하는 후속
테이블이지만, 이번 태스크(인증+웨딩 온보딩)의 범위를 좁게 유지하기 위해 각자 별도 태스크로
미룬다. `POST /weddings`(03_API_spec.md #6)의 부작용 2·3번(timeline_items 생성, ai_invocations
로그)은 서비스 코드에 TODO로 남겨뒀다 — 이 테이블들이 생기면 그 자리만 채우면 된다.

category_code ENUM은 여기서 딱 한 번만 만든다 — vendor_case_examples(576130d068f7, 다른
세션에서 병행 작업)는 category_code ENUM을 안 쓰고 TEXT+CHECK로 독립적으로 만들어졌으므로
이 리비전과 순서 무관하게 충돌 없음.

pgcrypto 관련: 04_DB_schema.sql 원문엔 `CREATE EXTENSION IF NOT EXISTS pgcrypto`가 있지만,
66e6da86e72e가 이미 확인한 대로 Azure Postgres Flexible Server의 `azure.extensions`
허용목록에 기본적으로 없어 실측으로 막힌다 — gen_random_uuid()는 PostgreSQL 13+ core 내장
함수라 애초에 확장이 필요 없으므로 그 줄은 넣지 않는다(기존 마이그레이션과 동일 판단).

Revision ID: 63c0e2ae03d4
Revises: 576130d068f7
Create Date: 2026-08-24 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "63c0e2ae03d4"
down_revision: str | Sequence[str] | None = "576130d068f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TYPE category_code AS ENUM (
            'MEETING', 'VENUE', 'SDM', 'GIFT', 'HOMEWARE', 'INVITATION', 'HONEYMOON', 'HOMENEW', 'ETC'
        )
    """)

    op.execute("""
        CREATE TABLE users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT,
            auth_provider TEXT CHECK (auth_provider IN ('GOOGLE','KAKAO','NAVER','APPLE')),
            auth_provider_id TEXT,
            display_name TEXT,
            profile_image_url TEXT,
            email_verified_at TIMESTAMPTZ,
            status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DELETED')),
            is_admin BOOLEAN NOT NULL DEFAULT false,
            terms_agreed_at TIMESTAMPTZ,
            privacy_policy_version TEXT,
            anonymized_at TIMESTAMPTZ,
            last_login_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK ( (auth_provider IS NULL) = (auth_provider_id IS NULL) ),
            UNIQUE (auth_provider, auth_provider_id)
        )
    """)

    op.execute("""
        CREATE TABLE auth_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            session_token_hash TEXT NOT NULL UNIQUE,
            login_method TEXT NOT NULL CHECK (login_method IN ('LOCAL','GOOGLE','KAKAO','NAVER','APPLE')),
            issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ,
            user_agent TEXT,
            ip_address TEXT
        )
    """)
    op.execute("CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id)")

    op.execute("""
        CREATE TABLE weddings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            owner_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            user_role TEXT NOT NULL CHECK (user_role IN ('BRIDE','GROOM')),
            wedding_date DATE NOT NULL,
            wedding_date_precision TEXT NOT NULL DEFAULT 'EXACT'
                CHECK (wedding_date_precision IN
                    ('EXACT','APPROX_H2_THIS_YEAR','APPROX_H1_NEXT_YEAR','APPROX_H2_NEXT_YEAR','NO_PLAN')),
            total_budget BIGINT NOT NULL CHECK (total_budget > 0),
            total_budget_unsure BOOLEAN NOT NULL DEFAULT false,
            region_code TEXT NOT NULL,
            guest_count_unsure BOOLEAN NOT NULL DEFAULT false,
            guest_count INT,
            taste_preference TEXT CHECK (taste_preference IN ('MINIMAL','BUDGET','GRAND','BALANCED')),
            venue_priority TEXT CHECK (venue_priority IN ('FOOD','LOCATION','PARKING','CAPACITY')),
            sdm_priority TEXT CHECK (sdm_priority IN ('DRESS','PHOTO','MAKEUP')),
            primary_goals TEXT[],
            priorities JSONB,
            done_so_far JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE wedding_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
            category_code category_code NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            planned_budget BIGINT NOT NULL DEFAULT 0 CHECK (planned_budget >= 0),
            selected_options TEXT[],
            skip_reason TEXT,
            display_order SMALLINT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (wedding_id, category_code)
        )
    """)
    op.execute("CREATE INDEX idx_wedding_categories_wedding ON wedding_categories(wedding_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS wedding_categories")
    op.execute("DROP TABLE IF EXISTS weddings")
    op.execute("DROP TABLE IF EXISTS auth_sessions")
    op.execute("DROP TABLE IF EXISTS users")
    op.execute("DROP TYPE IF EXISTS category_code")
