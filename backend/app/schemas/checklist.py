"""#12-14 — 03_API_spec.md §3-②. 체크리스트 항목 조회/수정/직접추가.

v3.0의 checklist_items(마스터)+checklist_progress(진행상황) 분리가 폐지되고, 웨딩별 행 1개에
status가 직접 있다(app/models/checklist.py). id가 int(구 마스터 PK)에서 UUID(웨딩별 행 PK)로
바뀐 것도 이 구조 변경의 결과."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import CategoryCode, ChecklistStatus, ItemType, Origin, SourceTier


class ChecklistItemOut(BaseModel):
    id: UUID
    category_code: CategoryCode
    item_type: ItemType
    option_group: str | None
    origin: Origin
    status: ChecklistStatus
    group_label: str
    title: str
    body: str | None
    priority: str
    source_tier: SourceTier | None
    source_label: str | None
    source_url: str | None
    tag: str | None
    memo: str | None


class ChecklistListOut(BaseModel):
    items: list[ChecklistItemOut]


class ChecklistItemPatch(BaseModel):
    status: ChecklistStatus | None = None
    memo: str | None = None


class ChecklistItemPatchOut(BaseModel):
    id: UUID
    status: ChecklistStatus
    memo: str | None
    updated_at: datetime


class ChecklistItemCreate(BaseModel):
    category_code: CategoryCode
    item_type: ItemType
    group_label: str
    title: str
    body: str | None = None
    priority: str = "mid"
    option_group: str | None = None
    tag: str | None = None
