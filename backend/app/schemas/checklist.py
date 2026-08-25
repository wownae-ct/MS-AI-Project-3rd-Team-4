"""#12-14 — 03_API_spec.md §3-②. 체크리스트 항목 조회/수정/직접추가.

v3.0의 checklist_items(마스터)+checklist_progress(진행상황) 분리가 폐지되고, 웨딩별 행 1개에
status가 직접 있다(app/models/checklist.py). id가 int(구 마스터 PK)에서 UUID(웨딩별 행 PK)로
바뀐 것도 이 구조 변경의 결과."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import CategoryCode, ChecklistStatus, ItemType, Origin, SourceTier

# 사용자가 POST /checklist-items(#14)로 직접 만드는 항목(origin=USER)의 길이 상한 — LLM
# 생성 항목(origin=LLM)은 이 스키마를 거치지 않아 영향 없다. 프론트(dev-b4)도 입력 폼에
# 동일 값으로 maxLength+truncate를 맞춘다(2026-08-26 인터페이스 합의).
CHECKLIST_TITLE_MAX_LENGTH = 200
CHECKLIST_BODY_MAX_LENGTH = 2000


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
    title: str = Field(max_length=CHECKLIST_TITLE_MAX_LENGTH)
    body: str | None = Field(default=None, max_length=CHECKLIST_BODY_MAX_LENGTH)
    priority: str = "mid"
    option_group: str | None = None
    tag: str | None = None
