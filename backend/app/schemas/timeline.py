"""#17-18 — 03_API_spec.md §3. 타임라인(마일스톤) 조회/수정."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import CategoryCode, MilestoneStatus


class MilestoneOut(BaseModel):
    id: UUID
    category_code: CategoryCode
    title: str
    phase_label: str
    target_date: date
    status: MilestoneStatus
    is_overdue: bool


class TimelineOut(BaseModel):
    milestones: list[MilestoneOut]


class MilestoneUpdate(BaseModel):
    target_date: date | None = None
    status: MilestoneStatus | None = None
