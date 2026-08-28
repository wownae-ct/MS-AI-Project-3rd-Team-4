"""recreate chat v4

chat_sessions/chat_messages — 04_DB_spec.md §4-(13)(14). 7713273146d1이 v3.0 shape(category_id →
이미 드롭된 categories 테이블 FK)로 이 테이블들을 DROP한 뒤 재생성되지 않은 채 남아있었다 —
app/models/chat.py는 그동안 존재하지 않는 categories.id FK를 참조하는 v3.0 모양 그대로였고,
app/services/chat.py는 v3.0 잔재 Category 셰임 클래스(app/models/wedding.py)에 의존해 실제로는
매 요청이 500이 나는 상태였다.

category_code는 63c0e2ae03d4가 만든 category_code ENUM 타입을 재사용한다(payments/checklist_items/
timeline_items와 동일 원칙 — 이 마이그레이션에서 CREATE TYPE을 또 하지 않는다). nullable인 이유는
04_DB_schema.sql 원본 DDL 자체가 nullable로 정의해서다.

Revision ID: be2aad3d6908
Revises: eac99fa785c5
Create Date: 2026-08-24 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "be2aad3d6908"
down_revision: str | Sequence[str] | None = "eac99fa785c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE chat_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
            category_code category_code,
            title TEXT,
            last_message_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX idx_chat_sessions_wedding ON chat_sessions(wedding_id, last_message_at)"
    )
    op.execute("""
        CREATE TABLE chat_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('user','assistant')),
            content TEXT NOT NULL,
            citations JSONB,
            verification JSONB,
            latency_ms INT,
            trace_ref TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX idx_chat_messages_session_time ON chat_messages(session_id, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS chat_messages")
    op.execute("DROP TABLE IF EXISTS chat_sessions")
