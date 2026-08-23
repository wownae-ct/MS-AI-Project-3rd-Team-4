"""#12-14 GET/PATCH/POST /checklist-items — 03_API_spec.md §3-②.

get_current_wedding으로 wedding_id를 세션에서 유도한다 — URL/바디로 안 받음(다른 사람 웨딩
접근 자체가 불가능하도록 auth 재구현이 정한 원칙, app/deps.py)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.categories import CATEGORY_META_BY_CODE
from app.core.db import get_session
from app.core.errors import api_error
from app.deps import get_current_wedding
from app.models import Wedding
from app.schemas.checklist import (
    ChecklistItemCreate,
    ChecklistItemOut,
    ChecklistItemPatch,
    ChecklistItemPatchOut,
    ChecklistListOut,
)
from app.services.checklist import (
    create_checklist_item,
    get_checklist_item,
    is_valid_status_for_category,
    list_checklist_items,
    update_checklist_item,
)

router = APIRouter(tags=["checklist"])


def _to_out(item) -> ChecklistItemOut:
    return ChecklistItemOut(
        id=item.id,
        category_code=item.category_code,
        item_type=item.item_type,
        option_group=item.option_group,
        origin=item.origin,
        status=item.status,
        group_label=item.group_label,
        title=item.title,
        body=item.body,
        priority=item.priority,
        source_tier=item.source_tier,
        source_label=item.source_label,
        source_url=item.source_url,
        tag=item.tag,
        memo=item.memo,
    )


@router.get("/checklist-items", response_model=ChecklistListOut)
async def get_checklist_items(
    category_code: str | None = None,
    item_type: str | None = None,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> ChecklistListOut:
    if category_code is not None and category_code not in CATEGORY_META_BY_CODE:
        raise api_error(
            404, "CATEGORY_NOT_FOUND", f"{category_code}는 존재하지 않는 카테고리입니다."
        )
    items = await list_checklist_items(session, wedding.id, category_code, item_type)
    return ChecklistListOut(items=[_to_out(item) for item in items])


@router.patch("/checklist-items/{item_id}", response_model=ChecklistItemPatchOut)
async def patch_checklist_item(
    item_id: str,
    payload: ChecklistItemPatch,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> ChecklistItemPatchOut:
    item = await get_checklist_item(session, wedding.id, item_id)
    if item is None:
        raise api_error(404, "CHECKLIST_ITEM_NOT_FOUND", "해당 체크리스트 항목을 찾을 수 없습니다.")
    if payload.status is not None and not is_valid_status_for_category(
        item.category_code, payload.status
    ):
        raise api_error(
            422,
            "INVALID_STATUS_FOR_CATEGORY",
            f"{item.category_code} 카테고리에는 status={payload.status}를 쓸 수 없습니다.",
        )
    updated = await update_checklist_item(session, item, payload.status, payload.memo)
    return ChecklistItemPatchOut(
        id=updated.id, status=updated.status, memo=updated.memo, updated_at=updated.updated_at
    )


@router.post("/checklist-items", response_model=ChecklistItemOut, status_code=201)
async def post_checklist_item(
    payload: ChecklistItemCreate,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> ChecklistItemOut:
    if payload.category_code not in CATEGORY_META_BY_CODE:
        raise api_error(
            404, "CATEGORY_NOT_FOUND", f"{payload.category_code}는 존재하지 않는 카테고리입니다."
        )
    item = await create_checklist_item(
        session,
        wedding.id,
        payload.category_code,
        payload.item_type,
        payload.group_label,
        payload.title,
        payload.body,
        payload.priority,
        payload.option_group,
        payload.tag,
    )
    return _to_out(item)
