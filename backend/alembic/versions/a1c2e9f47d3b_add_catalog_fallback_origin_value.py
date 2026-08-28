"""add CATALOG_FALLBACK to checklist/timeline origin CHECK constraint

2026-08-28 — red-bug.md "origin='LLM' mislabel" 항목 조치(옵션 B 채택). 개인화 폴백
카탈로그(validate BLOCKED 시 대체되는 행)도 지금까지 origin='LLM'으로 저장돼, "진짜 LLM
생성"과 "카탈로그 대체분"을 행 단위로 구분할 방법이 없었다. CHECK 제약에 'CATALOG_FALLBACK'
값을 추가하고, app/services/personalization.py::_checklist_fallback_rows +
app/services/timeline.py::generate_timeline_items(타임라인 폴백 경로)가 이 값을 쓰도록
같은 PR에서 함께 바꾼다. 기존 origin='LLM'으로 이미 저장된 과거 행은 마이그레이션이 되돌려
바꾸지 않는다(신규 생성분부터만 적용 — 과거 데이터 백필은 범위 밖, 이 프로젝트는 데모용
소규모 데이터셋이라 재개인화로 자연히 갱신됨).

down_revision을 f3a8c9d2e6b1(같은 세션에서 만든 온보딩 custom_request 마이그레이션)로
잡는다 — 두 기능이 같은 로컬 dev DB를 공유해 실제로는 그 마이그레이션이 이미 적용된
상태이기 때문(순차 체인으로 실검증하기 위함). PR 병합 순서가 바뀌면 이 값을 다시 맞춰야
할 수 있다.

**실행 중 발견한 기존 드리프트**: `app/models/checklist.py`/`timeline.py`는 이 제약을
`ck_checklist_items_origin`/`ck_timeline_items_origin`으로 선언하지만, 실제 라이브 DB의
제약 이름은 `checklist_items_origin_check`/`timeline_items_origin_check`다 — 원 생성
마이그레이션(`9fbddcf98efe_recreate_checklist_timeline_v4.py`)이 테이블 레벨 이름 있는
제약이 아니라 컬럼 인라인 `CHECK`로 만들어서 Postgres가 기본 이름을 자동 생성했기 때문
(이 프로젝트는 Alembic autogenerate를 안 써서 모델-DB 이름 불일치가 지금까지 조용히
무해했다 — DROP/재생성이 필요해진 지금 처음 드러남). 이 마이그레이션이 DROP은 실제 이름으로,
ADD는 모델이 선언한 이름으로 해 이 드리프트도 같이 바로잡는다.

Revision ID: a1c2e9f47d3b
Revises: f3a8c9d2e6b1
Create Date: 2026-08-28 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1c2e9f47d3b"
down_revision: str | Sequence[str] | None = "f3a8c9d2e6b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE checklist_items
            DROP CONSTRAINT checklist_items_origin_check,
            ADD CONSTRAINT ck_checklist_items_origin
                CHECK (origin IN ('LLM','USER','CATALOG_FALLBACK'))
    """)
    op.execute("""
        ALTER TABLE timeline_items
            DROP CONSTRAINT timeline_items_origin_check,
            ADD CONSTRAINT ck_timeline_items_origin
                CHECK (origin IN ('LLM','USER','CATALOG_FALLBACK'))
    """)


def downgrade() -> None:
    # CATALOG_FALLBACK으로 저장된 행이 이미 있으면 이 downgrade 자체가 실패한다(의도된 동작 —
    # 조용히 데이터를 깨뜨리는 것보다 명시적으로 막히는 편이 안전하다). 이름은 원래 라이브
    # 이름(자동생성분)이 아니라 이 마이그레이션이 upgrade에서 붙인 모델 선언 이름을 그대로
    # 되돌린다 — downgrade 후에도 이름 불일치가 남지 않게.
    op.execute("""
        ALTER TABLE checklist_items
            DROP CONSTRAINT ck_checklist_items_origin,
            ADD CONSTRAINT ck_checklist_items_origin CHECK (origin IN ('LLM','USER'))
    """)
    op.execute("""
        ALTER TABLE timeline_items
            DROP CONSTRAINT ck_timeline_items_origin,
            ADD CONSTRAINT ck_timeline_items_origin CHECK (origin IN ('LLM','USER'))
    """)
