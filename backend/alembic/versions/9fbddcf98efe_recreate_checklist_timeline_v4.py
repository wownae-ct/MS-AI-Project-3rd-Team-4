"""recreate ai_invocations, checklist_items, timeline_items v4.0

2026-08-24: v4.0 재설계(docs/wedding/plan/new/04_DB_schema.sql §C~E) 기준으로 개인화 라우터
에이전트 감사로그(ai_invocations)와 체크리스트/타임라인을 새로 만든다. 63c0e2ae03d4가 의도적으로
비워둔 3테이블 — 그 리비전의 docstring이 예고한 대로 여기서 채운다.

category_code는 63c0e2ae03d4가 만든 category_code ENUM 타입을 그대로 재사용한다(그 리비전이
"여기서 딱 한 번만 만든다"고 선언했으므로 새로 만들지 않음) — vendor_case_examples
(576130d068f7)와 달리 이 두 테이블은 auth/weddings 재구현과 순서 의존성이 있어(FK) ENUM이
이미 존재하는 시점에 만들 수 있다.

체크리스트/타임라인 개인화 라우터 에이전트(route→generate→validate LangGraph, 13번 문서) 자체는
이번 리비전 범위 밖 — 지금은 스토리지 계층만 만든다. 온보딩 시 타임라인은 결정론적 카탈로그
(app/core/timeline_catalog.py)로, 체크리스트는 03_API_spec.md #6 부작용 설명대로 "LLM 개인화
생성 트리거(비동기)"만 남기고 실제 생성은 후속 태스크에서 채운다(services/wedding.py의
TODO(personalization-task) 참고).

Revision ID: 9fbddcf98efe
Revises: 63c0e2ae03d4
Create Date: 2026-08-24 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9fbddcf98efe"
down_revision: str | Sequence[str] | None = "63c0e2ae03d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE ai_invocations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
            trigger TEXT NOT NULL CHECK (trigger IN ('ONBOARDING_INITIAL','FIELD_UPDATED','MANUAL_REGENERATE')),
            changed_fields TEXT[],
            affected_domains TEXT[],
            status TEXT NOT NULL CHECK (status IN ('SUCCESS','FAILED','BLOCKED')),
            error_message TEXT,
            trace_ref TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX idx_ai_invocations_wedding ON ai_invocations(wedding_id, created_at)")

    op.execute("""
        CREATE TABLE checklist_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
            category_code category_code NOT NULL,
            generated_by_run_id UUID REFERENCES ai_invocations(id),
            origin TEXT NOT NULL CHECK (origin IN ('LLM','USER')),
            status TEXT NOT NULL,
            item_type TEXT NOT NULL CHECK (item_type IN ('CONTRACT_TERM','EXTRA_COST','PREP')),
            option_group TEXT,
            group_label TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT,
            priority TEXT NOT NULL DEFAULT 'mid' CHECK (priority IN ('high','mid','low')),
            source_tier TEXT CHECK (source_tier IN ('OFFICIAL','CONSENSUS','INDUSTRY')),
            source_label TEXT,
            source_url TEXT,
            tag TEXT,
            memo TEXT,
            user_edited_at TIMESTAMPTZ,
            display_order SMALLINT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (
                (category_code = 'HOMEWARE' AND status IN ('LISTED','COMPARING','ORDERED','DELIVERED'))
                OR
                (category_code <> 'HOMEWARE' AND status IN ('TODO','DOING','SKIP','DONE'))
            )
        )
    """)
    op.execute(
        "CREATE INDEX idx_checklist_items_wedding_cat ON checklist_items(wedding_id, category_code)"
    )
    op.execute("""
        CREATE INDEX idx_checklist_items_active ON checklist_items(wedding_id)
            WHERE status IN ('DOING','COMPARING','ORDERED')
    """)
    op.execute(
        "CREATE INDEX idx_checklist_items_type ON checklist_items(wedding_id, category_code, item_type)"
    )

    op.execute("""
        CREATE TABLE timeline_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
            category_code category_code,
            generated_by_run_id UUID REFERENCES ai_invocations(id),
            origin TEXT NOT NULL CHECK (origin IN ('LLM','USER')),
            status TEXT NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO','DONE')),
            title TEXT NOT NULL,
            target_date DATE NOT NULL,
            default_dday_offset_days INT,
            date_overridden BOOLEAN NOT NULL DEFAULT false,
            user_edited_at TIMESTAMPTZ,
            display_order SMALLINT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX idx_timeline_items_wedding_date ON timeline_items(wedding_id, target_date)"
    )
    op.execute("""
        CREATE INDEX idx_timeline_items_upcoming ON timeline_items(wedding_id, target_date)
            WHERE status = 'TODO'
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS timeline_items")
    op.execute("DROP TABLE IF EXISTS checklist_items")
    op.execute("DROP TABLE IF EXISTS ai_invocations")
