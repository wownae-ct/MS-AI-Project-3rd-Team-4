"""checklist_items — 04_DB_schema.sql §D, BASELINE v4.0. 날짜 없음, timeline_items와 완전히
독립 — 체크했다고 타임라인이 바뀌거나 그 반대도 없다(11_v3_to_v4_diff.md §1-3).

v3.0 대비: `checklist_items`(마스터)+`checklist_progress`(진행상황) 2테이블이 이 1테이블로
합쳐졌다 — 웨딩별 행이 온보딩 시 LLM으로 개인화 생성되고 status가 같은 행에 직접 있다
(v3.0처럼 전역 마스터를 여러 웨딩이 공유 조회하는 구조가 아님).

HOMEWARE(혼수)는 다른 8개 카테고리와 다른 4단계 상태값을 쓴다 — 어떤 status가 유효한지는
category_code에 달려 있으므로 DB CHECK 제약이 최종 방어선이고, app/services/checklist.py가
API 레이어에서 먼저 걸러 명확한 422를 준다(03_API_spec.md #13).

Importer: app/models/__init__.py."""

from datetime import datetime
from uuid import UUID as UUIDType
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, SmallInteger, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base
from app.models.wedding import CategoryCodeEnum


class ChecklistItem(Base):
    __tablename__ = "checklist_items"
    __table_args__ = (
        CheckConstraint(
            "origin IN ('LLM','USER','CATALOG_FALLBACK')", name="ck_checklist_items_origin"
        ),
        CheckConstraint(
            "item_type IN ('CONTRACT_TERM','EXTRA_COST','PREP')",
            name="ck_checklist_items_item_type",
        ),
        CheckConstraint("priority IN ('high','mid','low')", name="ck_checklist_items_priority"),
        CheckConstraint(
            "source_tier IN ('OFFICIAL','CONSENSUS','INDUSTRY')",
            name="ck_checklist_items_source_tier",
        ),
        CheckConstraint(
            "(category_code = 'HOMEWARE' AND status IN ('LISTED','COMPARING','ORDERED','DELIVERED'))"
            " OR (category_code <> 'HOMEWARE' AND status IN ('TODO','DOING','SKIP','DONE'))",
            name="ck_checklist_items_status_by_category",
        ),
    )

    id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    wedding_id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("weddings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_code: Mapped[str] = mapped_column(CategoryCodeEnum, nullable=False)
    generated_by_run_id: Mapped[UUIDType | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai_invocations.id")
    )
    origin: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    item_type: Mapped[str] = mapped_column(Text, nullable=False)
    option_group: Mapped[str | None] = mapped_column(Text)
    group_label: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(Text, nullable=False, server_default="mid")
    source_tier: Mapped[str | None] = mapped_column(Text)
    source_label: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text)
    tag: Mapped[str | None] = mapped_column(Text)
    memo: Mapped[str | None] = mapped_column(Text)
    # DDL은 TIMESTAMPTZ다 — DateTime(timezone=True)를 명시해야 asyncpg가 tz-aware Python
    # datetime(datetime.now(UTC))을 그대로 바인딩할 수 있다(생략하면 SQLAlchemy가
    # TIMESTAMP WITHOUT TIME ZONE으로 캐스팅해 tz-aware 값 바인딩 시 asyncpg가 거부한다).
    user_edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    display_order: Mapped[int | None] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
