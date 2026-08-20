"""#8-9 — 03_API_spec.md §3. 체크리스트 항목 조회 및 진행상태 upsert."""

from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ChecklistStatus, ItemType, SourceTier


class ChecklistProgressOut(BaseModel):
    status: ChecklistStatus
    memo: str | None


class ChecklistItemOut(BaseModel):
    id: int
    item_type: ItemType
    option_group: str | None
    title: str
    body: str
    source_tier: SourceTier
    source_label: str | None
    source_url: str | None
    default_dday_offset: int | None
    progress: ChecklistProgressOut


class ChecklistListOut(BaseModel):
    category_code: str
    items: list[ChecklistItemOut]


class ChecklistProgressUpdate(BaseModel):
    status: ChecklistStatus
    memo: str | None = None


class ChecklistProgressUpdateOut(BaseModel):
    checklist_item_id: int
    status: ChecklistStatus
    memo: str | None
    updated_at: datetime
