"""recreate payments v4

payments — 04_DB_spec.md §4-⑥(8). 지출/납부예정 통합(status로만 구분). 7713273146d1이 v3.0
shape(category_id → 이미 드롭된 categories 테이블 FK)로 이 테이블을 DROP한 뒤 재생성되지 않은
채 남아있었다 — 다른 9개 v3.0 테이블처럼 별도 재구현 태스크로 미뤄져 있던 것을 이제 채운다.

category_code는 63c0e2ae03d4가 만든 category_code ENUM 타입을 재사용(checklist_items/
timeline_items와 동일 원칙 — auth/weddings 뒤에 오는 테이블은 이미 있는 ENUM을 새로 안 만든다).
contact_name/contact_phone/receipt_url 3개는 [프로토타입 반영] 컬럼.

인덱스는 실제 접근 패턴 2가지에 맞춰 만든다: GET /payments의 category_code 필터(idx_payments_
wedding_cat), GET /payments/upcoming의 status='PLANNED' 부분 인덱스(idx_payments_upcoming) —
timeline_items의 idx_timeline_items_upcoming과 동일 패턴.

Revision ID: eac99fa785c5
Revises: 9fbddcf98efe
Create Date: 2026-08-24 00:51:02.014756

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "eac99fa785c5"
down_revision: str | Sequence[str] | None = "9fbddcf98efe"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
            category_code category_code NOT NULL,
            item_name TEXT NOT NULL,
            payment_type TEXT NOT NULL CHECK (payment_type IN ('DEPOSIT','INTERIM','BALANCE','ETC')),
            vendor_name TEXT,
            contact_name TEXT,
            contact_phone TEXT,
            amount BIGINT NOT NULL CHECK (amount > 0),
            due_date DATE,
            paid_date DATE,
            status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','PAID','CANCELED')),
            receipt_url TEXT,
            memo TEXT
        )
    """)
    op.execute("CREATE INDEX idx_payments_wedding_cat ON payments(wedding_id, category_code)")
    op.execute("""
        CREATE INDEX idx_payments_upcoming ON payments(wedding_id, due_date)
            WHERE status = 'PLANNED'
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS payments")
