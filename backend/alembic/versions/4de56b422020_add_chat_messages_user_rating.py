"""add chat_messages user_rating

chat_messages.user_rating — 챗 답변에 대한 사용자 GOOD/BAD 평가. Langfuse Score(name=
"user_rating")로도 전송되지만(app/services/chat.py::rate_chat_message), Langfuse가 꺼져
있거나 trace_ref가 없는 행도 있으므로 DB가 SSOT다. F13 feedback_reports(부정 사유 CHECK +
관리자 모더레이션 워크플로우, ef62d360e9fb)와는 목적이 달라 재사용하지 않고 별도 컬럼으로 둔다.

Revision ID: 4de56b422020
Revises: ef62d360e9fb
Create Date: 2026-08-24 10:50:14.115418

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4de56b422020"
down_revision: str | Sequence[str] | None = "ef62d360e9fb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE chat_messages ADD COLUMN user_rating TEXT")
    op.execute(
        "ALTER TABLE chat_messages ADD CONSTRAINT ck_chat_messages_user_rating "
        "CHECK (user_rating IN ('GOOD','BAD'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS ck_chat_messages_user_rating")
    op.execute("ALTER TABLE chat_messages DROP COLUMN IF EXISTS user_rating")
