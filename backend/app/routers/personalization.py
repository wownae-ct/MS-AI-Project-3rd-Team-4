"""#32 POST /personalization/regenerate — 03_API_spec.md §9(신규). MANUAL_REGENERATE 수동
재생성 트리거.

get_current_wedding으로 wedding_id를 세션에서 유도한다 — URL/바디로 안 받음(다른 사람 웨딩
접근 자체가 불가능하도록 auth 재구현이 정한 원칙, app/deps.py, checklist.py/timeline.py와 동일
패턴). done_so_far는 넘기지 않는다 — 온보딩 1회성 신호라는 기존 원칙(app/models/wedding.py) 그대로,
FIELD_UPDATED 재트리거들과 동일하게 생략한다."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session
from app.deps import get_current_wedding
from app.models import Wedding
from app.schemas.personalization import (
    PersonalizationRegenerateOut,
    PersonalizationRegenerateRequest,
)
from app.services.personalization import run_personalization
from app.services.timeline import get_active_category_codes

router = APIRouter(tags=["personalization"])


@router.post("/personalization/regenerate", response_model=PersonalizationRegenerateOut)
async def regenerate_personalization(
    payload: PersonalizationRegenerateRequest,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> PersonalizationRegenerateOut:
    active_categories = await get_active_category_codes(session, wedding.id)
    ai_invocation = await run_personalization(
        session,
        get_settings(),
        wedding,
        active_categories,
        trigger="MANUAL_REGENERATE",
        requested_domains=payload.domains,
    )
    await session.commit()
    return PersonalizationRegenerateOut(
        ai_invocation_id=ai_invocation.id,
        status=ai_invocation.status,
        affected_domains=ai_invocation.affected_domains or [],
    )
