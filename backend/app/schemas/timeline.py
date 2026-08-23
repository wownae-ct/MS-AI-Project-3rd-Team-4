"""#15-17 — 03_API_spec.md §3-③. 타임라인 항목 조회/수정/직접추가.

phase_label(구 "D-11M" 라벨)은 응답에 없다 — 2026-08-23 세션 결정으로 컬럼 자체를 안 만들고
프론트가 default_dday_offset_days에서 공식 계산한다(13_personalization_router_agent_design.md
§3). is_overdue는 저장하지 않고 조회 시점에 서버가 계산해 내려준다."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import CategoryCode, MilestoneStatus, Origin


class TimelineItemOut(BaseModel):
    id: UUID
    category_code: CategoryCode | None
    origin: Origin
    title: str
    target_date: date
    default_dday_offset_days: int | None
    status: MilestoneStatus
    date_overridden: bool
    is_overdue: bool


class TimelineListOut(BaseModel):
    items: list[TimelineItemOut]


class TimelineItemPatch(BaseModel):
    target_date: date | None = None
    status: MilestoneStatus | None = None


class TimelineItemCreate(BaseModel):
    category_code: CategoryCode | None = None
    title: str
    target_date: date
