"""#15-17 GET/PATCH/POST /timeline-items — 03_API_spec.md §3-③.

get_current_wedding으로 wedding_id를 세션에서 유도한다(app/routers/checklist.py와 동일 원칙)."""

import logging
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.categories import CATEGORY_META_BY_CODE
from app.core.db import get_session
from app.core.errors import api_error
from app.deps import get_current_wedding
from app.models import Wedding
from app.schemas.timeline import (
    TimelineItemCreate,
    TimelineItemOut,
    TimelineItemPatch,
    TimelineListOut,
)
from app.services.timeline import (
    create_timeline_item,
    get_active_category_codes,
    get_timeline_item,
    is_overdue,
    list_timeline_items,
    update_timeline_item,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["timeline"])


def _to_out(item, today: date) -> TimelineItemOut:
    return TimelineItemOut(
        id=item.id,
        category_code=item.category_code,
        origin=item.origin,
        title=item.title,
        target_date=item.target_date,
        default_dday_offset_days=item.default_dday_offset_days,
        status=item.status,
        date_overridden=item.date_overridden,
        is_overdue=is_overdue(item.target_date, item.status, today),
    )


@router.get("/timeline-items", response_model=TimelineListOut)
async def get_timeline_items(
    category_code: str | None = None,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> TimelineListOut:
    if category_code is not None and category_code not in CATEGORY_META_BY_CODE:
        raise api_error(
            404, "CATEGORY_NOT_FOUND", f"{category_code}는 존재하지 않는 카테고리입니다."
        )
    active = await get_active_category_codes(session, wedding.id)
    items = await list_timeline_items(session, wedding.id, active, category_code)
    today = datetime.now(UTC).date()
    return TimelineListOut(items=[_to_out(item, today) for item in items])


@router.patch("/timeline-items/{item_id}", response_model=TimelineItemOut)
async def patch_timeline_item(
    item_id: str,
    payload: TimelineItemPatch,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> TimelineItemOut:
    item = await get_timeline_item(session, wedding.id, item_id)
    if item is None:
        # 2026-08-26 레드팀 감사 4라운드 LOW 항목 — 웨딩 소유 범위 밖 리소스 404가 무로깅이면
        # ID 스캐닝/IDOR 탐지 목적을 놓친다(app/routers/checklist.py와 동일 패턴).
        logger.info("Timeline item not found for wedding_id=%s item_id=%s", wedding.id, item_id)
        raise api_error(404, "TIMELINE_ITEM_NOT_FOUND", "해당 타임라인 항목을 찾을 수 없습니다.")
    updated = await update_timeline_item(session, item, payload.target_date, payload.status)
    return _to_out(updated, datetime.now(UTC).date())


@router.post("/timeline-items", response_model=TimelineItemOut, status_code=201)
async def post_timeline_item(
    payload: TimelineItemCreate,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> TimelineItemOut:
    if payload.category_code is not None and payload.category_code not in CATEGORY_META_BY_CODE:
        raise api_error(
            404, "CATEGORY_NOT_FOUND", f"{payload.category_code}는 존재하지 않는 카테고리입니다."
        )
    item = await create_timeline_item(
        session, wedding.id, payload.category_code, payload.title, payload.target_date
    )
    return _to_out(item, datetime.now(UTC).date())
