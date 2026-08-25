"""add wedding_date_precision APPROX_H1_YEAR_AFTER_NEXT

온보딩 S1 "결혼예정일 미정" 칩이 "오늘이 속한 반기 다음부터 연속 3개 반기"를 항상 보여주도록
확정되면서(프론트 요청), 오늘이 하반기(예: 8월)일 때 3번째 칩("그다음해 상반기")에 대응하는
근사 버킷이 기존 3개(APPROX_H2_THIS_YEAR/APPROX_H1_NEXT_YEAR/APPROX_H2_NEXT_YEAR)에 없어 값
추가. app/services/wedding.py::approximate_wedding_date()는 기존 H1 패턴(3월 15일)을 따라
`date(year+2, 3, 15)`로 매핑한다(app/models/wedding.py, app/schemas/wedding.py 함께 수정).

기존 CHECK 제약(63c0e2ae03d4)이 이름 없이 인라인으로 생성돼 실제 제약 이름이 SQLAlchemy 모델의
`ck_weddings_date_precision`이 아니라 Postgres 기본 명명(`weddings_wedding_date_precision_check`)
일 수 있어, pg_catalog에서 실제 이름을 찾아 드롭한 뒤 모델과 일치하는 이름으로 재생성한다.

Revision ID: 0d557975d510
Revises: 4de56b422020
Create Date: 2026-08-26 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0d557975d510"
down_revision: str | Sequence[str] | None = "4de56b422020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_VALUES = "'EXACT','APPROX_H2_THIS_YEAR','APPROX_H1_NEXT_YEAR','APPROX_H2_NEXT_YEAR','NO_PLAN'"
_NEW_VALUES = (
    "'EXACT','APPROX_H2_THIS_YEAR','APPROX_H1_NEXT_YEAR','APPROX_H2_NEXT_YEAR',"
    "'APPROX_H1_YEAR_AFTER_NEXT','NO_PLAN'"
)

_DROP_EXISTING_CHECK = """
    DO $$
    DECLARE
        con_name TEXT;
    BEGIN
        SELECT conname INTO con_name
        FROM pg_constraint
        WHERE conrelid = 'weddings'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%wedding_date_precision%';

        IF con_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE weddings DROP CONSTRAINT %I', con_name);
        END IF;
    END $$;
"""


def upgrade() -> None:
    op.execute(_DROP_EXISTING_CHECK)
    op.execute(
        f"ALTER TABLE weddings ADD CONSTRAINT ck_weddings_date_precision "
        f"CHECK (wedding_date_precision IN ({_NEW_VALUES}))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE weddings DROP CONSTRAINT IF EXISTS ck_weddings_date_precision")
    op.execute(_DROP_EXISTING_CHECK)
    op.execute(
        f"ALTER TABLE weddings ADD CONSTRAINT ck_weddings_date_precision "
        f"CHECK (wedding_date_precision IN ({_OLD_VALUES}))"
    )
