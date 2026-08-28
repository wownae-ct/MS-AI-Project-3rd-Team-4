"""add wedding custom_request column

2026-08-28 — 온보딩 개인화(체크리스트/타임라인 자동 생성)에 사용자 커스텀 자유서술 질문을
추가하기 위한 컬럼. 기존 primary_goals/taste_preference 등 객관식 필드와 달리 자유 텍스트라
DB CHECK 제약은 두지 않고, 길이 상한(500자)은 app/schemas/wedding.py::CUSTOM_REQUEST_MAX_LENGTH
에서 애플리케이션 레벨로만 검증한다.

Revision ID: f3a8c9d2e6b1
Revises: c361a04026fe
Create Date: 2026-08-28 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3a8c9d2e6b1"
down_revision: str | Sequence[str] | None = "c361a04026fe"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE weddings ADD COLUMN custom_request TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE weddings DROP COLUMN custom_request")
