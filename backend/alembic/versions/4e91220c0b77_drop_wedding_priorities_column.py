"""drop weddings.priorities column

`priorities` JSONB는 venue_priority/sdm_priority와 별개로 63c0e2ae03d4에서 "카테고리별
우선순위 자유서술"용으로 만들어졌지만, WeddingCreate/WeddingUpdate 스키마에 필드가 없어 API로
쓸 방법이 아예 없었다 — create_wedding()도 이 필드를 채우지 않아 항상 NULL이었다(2026-08-26
personalization 감사 중 프론트 dev-b4 세션이 발견, docs/study/merrymap-backend-lab-note.html
참고). venue_priority/sdm_priority가 이미 같은 역할(카테고리 우선순위)을 구조화된 ENUM으로
제공하고 있어 되살리지 않고 완전히 제거하기로 결정.

기존 행 전부 NULL이었으므로 데이터 손실 없음 — downgrade는 컬럼을 NULL 허용으로 재생성만 한다
(과거 값을 복구할 수 없어서가 아니라 애초에 값이 없었기 때문).

Revision ID: 4e91220c0b77
Revises: 0d557975d510
Create Date: 2026-08-26 00:10:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4e91220c0b77"
down_revision: str | Sequence[str] | None = "0d557975d510"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE weddings DROP COLUMN IF EXISTS priorities")


def downgrade() -> None:
    op.execute("ALTER TABLE weddings ADD COLUMN priorities JSONB")
