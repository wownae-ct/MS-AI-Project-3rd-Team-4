"""recreate price_benchmarks v4.0

2026-08-23: v4.0 재설계(docs/wedding/plan/new/04_DB_schema.sql) 기준으로 price_benchmarks를
새로 만든다. 7713273146d1에서 지운 뒤 첫 재구현 대상이라 이 리비전이 새로 CREATE한다.

v3.0 대비 변경점(04_ERD.md, 11_v3_to_v4_diff.md §1-5):
  - category_code CHECK가 ('VENUE','SDM') 2값 → 9개 카테고리+'TOTAL' 10값으로 확장. 다른
    카테고리 참조 테이블과 달리 categories ENUM을 안 쓰고 굳이 TEXT+CHECK로 남겨두는 이유는
    'TOTAL'(F7 예산 미정 슬라이더 placeholder용 특수값)이 다른 곳엔 절대 허용되면 안 되기
    때문 — ENUM에 넣으면 이 특수값을 다른 카테고리 테이블에서도 값으로 받아버리게 된다.
  - item_code에 DEFAULT 'TOTAL' 추가 — 카테고리 전체 합계 행을 별도 item_code 없이 표현.
  - source_note(nullable) 신규 — 저작권검토서(06_RAG_implementation_and_copyright_review.md)가
    요구하는 "한국소비자원 참가격, YYYY-MM 기준" 출처표시 문구를 담는 자리.
  - categories FK 없음(v3.0부터 이미 없었음, 유지) — "결혼과 무관한 참고표"라 wedding_id도 없다.

Revision ID: 9acc4aa37be1
Revises: 7713273146d1
Create Date: 2026-08-23 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9acc4aa37be1"
down_revision: str | Sequence[str] | None = "7713273146d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE price_benchmarks (
            id BIGSERIAL PRIMARY KEY,
            survey_month DATE NOT NULL,
            region_code TEXT NOT NULL,
            category_code TEXT NOT NULL CHECK (category_code IN
                ('MEETING','VENUE','SDM','GIFT','HOMEWARE','INVITATION','HONEYMOON','HOMENEW','ETC','TOTAL')),
            item_code TEXT NOT NULL DEFAULT 'TOTAL',
            median_price BIGINT NOT NULL,
            min_price BIGINT,
            max_price BIGINT,
            sample_count INT,
            source_url TEXT NOT NULL,
            source_note TEXT,
            UNIQUE (survey_month, region_code, category_code, item_code)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS price_benchmarks")
