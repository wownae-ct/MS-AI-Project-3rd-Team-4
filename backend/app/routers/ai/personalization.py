"""#32 POST /personalization/regenerate — 03_API_spec.md §9(신규). MANUAL_REGENERATE 수동
재생성 트리거.

get_current_wedding으로 wedding_id를 세션에서 유도한다 — URL/바디로 안 받음(다른 사람 웨딩
접근 자체가 불가능하도록 auth 재구현이 정한 원칙, app/deps.py, checklist.py/timeline.py와 동일
패턴). done_so_far는 넘기지 않는다 — 온보딩 1회성 신호라는 기존 원칙(app/models/wedding.py) 그대로,
FIELD_UPDATED 재트리거들과 동일하게 생략한다."""

import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session
from app.core.rate_limit import limiter, user_or_ip_key
from app.deps import get_current_wedding
from app.models import Wedding
from app.schemas.personalization import (
    PersonalizationRegenerateOut,
    PersonalizationRegenerateRequest,
)
from app.services.personalization import run_personalization
from app.services.timeline import get_active_category_codes

logger = logging.getLogger(__name__)

router = APIRouter(tags=["personalization"])


@router.post("/personalization/regenerate", response_model=PersonalizationRegenerateOut)
@limiter.limit("10/minute", key_func=user_or_ip_key)
# 17_qa_e2e_test_plan.md §14-2 — LLM 호출 엔드포인트, 계정 기준 제한(create_wedding과 동일 근거).
async def regenerate_personalization(
    request: Request,
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
    if ai_invocation.status != "SUCCESS":
        # 2026-08-26 레드팀 감사 4라운드 항목 24 — 수동 재생성 결과가 BLOCKED/FAILED여도
        # 무로깅이었다.
        logger.warning(
            "Manual personalization regenerate ended with status=%s for wedding_id=%s: %s",
            ai_invocation.status,
            wedding.id,
            ai_invocation.error_message,
        )
    await session.commit()
    return PersonalizationRegenerateOut(
        ai_invocation_id=ai_invocation.id,
        status=ai_invocation.status,
        affected_domains=ai_invocation.affected_domains or [],
    )
