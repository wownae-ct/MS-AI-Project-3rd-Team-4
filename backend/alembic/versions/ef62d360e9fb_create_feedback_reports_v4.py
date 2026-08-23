"""create feedback_reports v4

feedback_reports — 04_DB_spec.md §4-⑮, F13/책임있는 AI "책임성"·"신뢰성 및 안전성" 원칙 대응.
이전 어떤 리비전에도 존재한 적 없는 완전 신규 테이블(v3.0에도 없었음).

target_id는 의도적으로 DB FK가 아니다 — target_type(CHAT_MESSAGE/CHECKLIST_ITEM/TIMELINE_ITEM)에
따라 가리키는 테이블이 달라지는 다형 참조라 단일 FK로 표현할 수 없고, app/services/feedback.py가
target_type에 맞는 테이블에서 존재+소유권(wedding_id)만 확인한다(04_DB_spec.md §4-⑩).

reason_category 값 중 '편향/차별적'은 슬래시(/)를 포함한 문자열 그대로다 — 04_DB_schema.sql/
03_API_spec.md 둘 다 이 표기라 정규화하지 않는다.

Revision ID: ef62d360e9fb
Revises: be2aad3d6908
Create Date: 2026-08-24 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ef62d360e9fb"
down_revision: str | Sequence[str] | None = "be2aad3d6908"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE feedback_reports (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
            target_type TEXT NOT NULL
                CHECK (target_type IN ('CHAT_MESSAGE','CHECKLIST_ITEM','TIMELINE_ITEM')),
            target_id UUID NOT NULL,
            reason_category TEXT NOT NULL
                CHECK (reason_category IN ('부정확함','부적절함','도움안됨','편향/차별적','기타')),
            comment TEXT,
            status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEWED','RESOLVED')),
            resolved_at TIMESTAMPTZ,
            resolved_by UUID REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX idx_feedback_reports_status ON feedback_reports(status, created_at)")
    op.execute(
        "CREATE INDEX idx_feedback_reports_target ON feedback_reports(target_type, target_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS feedback_reports")
