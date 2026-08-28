"""seed categories

7개 카테고리 고정 데이터. 04_DB_spec.md §3 샘플 데이터 표 그대로 — 스키마와 함께 커밋되는
고정값이라 (콘텐츠성 시드와 달리) 마이그레이션에 포함한다(같은 문서 §8 "Alembic은 2개로 끝낸다").

Revision ID: 7e1bfc107dc7
Revises: 66e6da86e72e
Create Date: 2026-08-20 18:14:00.126926

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7e1bfc107dc7"
down_revision: str | Sequence[str] | None = "66e6da86e72e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

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
    op.bulk_insert(_CATEGORIES_TABLE, _CATEGORIES_ROWS)


def downgrade() -> None:
    op.execute("DELETE FROM categories WHERE id IN (1,2,3,4,5,6,7)")
