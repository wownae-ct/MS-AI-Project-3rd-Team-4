"""add wedding personalization columns

2026-08-21 온보딩 개인화 스코프 확장분(docs/wedding/ing/todo.md §1-a, 04_DB_spec.md §4-(1)
"2026-08-21 추가"): weddings에 wedding_date_precision/user_role/taste_preference/
venue_priority/sdm_priority 5개 컬럼을 추가한다. init 마이그레이션(66e6da86e72e) 시점엔
없었던 컬럼들이라 별도 리비전으로 분리 — 04_DB_spec.md §8의 "Alembic 2개로 끝낸다" 원칙에서
벗어나지만, 스코프 확장이 스키마 마이그레이션 자체를 새로 요구하는 경우라 어쩔 수 없다.

실행 시점(2026-08-21)에 weddings 행이 0개임을 전제로 한다 — POST /weddings가 이 리비전
이전까지 501 스텁이라 온보딩된 적이 없다(done.md 확인). 만약 행이 이미 있다면 NOT NULL
컬럼(user_role) 추가가 실패하므로 그때는 이 마이그레이션을 그대로 재사용하지 말 것.

Revision ID: 2a23250a6ef0
Revises: 7e1bfc107dc7
Create Date: 2026-08-21 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2a23250a6ef0"
down_revision: str | Sequence[str] | None = "7e1bfc107dc7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE weddings
            ADD COLUMN wedding_date_precision TEXT NOT NULL DEFAULT 'EXACT'
                CHECK (wedding_date_precision IN
                    ('EXACT','APPROX_H2_THIS_YEAR','APPROX_H1_NEXT_YEAR','APPROX_H2_NEXT_YEAR','NO_PLAN')),
            ADD COLUMN user_role TEXT NOT NULL CHECK (user_role IN ('BRIDE','GROOM')),
            ADD COLUMN taste_preference TEXT CHECK (taste_preference IN ('MINIMAL','BUDGET','GRAND','BALANCED')),
            ADD COLUMN venue_priority TEXT CHECK (venue_priority IN ('FOOD','LOCATION','PARKING','CAPACITY')),
            ADD COLUMN sdm_priority TEXT CHECK (sdm_priority IN ('DRESS','PHOTO','MAKEUP'))
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE weddings
            DROP COLUMN wedding_date_precision,
            DROP COLUMN user_role,
            DROP COLUMN taste_preference,
            DROP COLUMN venue_priority,
            DROP COLUMN sdm_priority
    """)
