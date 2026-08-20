"""공용 FastAPI 의존성. 인증이 없으므로(BASELINE §0) "로그인한 사용자"가 아니라
"시드된 단일 weddings 행"이 모든 요청의 대상이다."""

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models import Wedding


async def get_the_wedding(session: AsyncSession = Depends(get_session)) -> Wedding:  # noqa: B008
    """유일한 weddings 행을 반환한다. 온보딩 전이면 404(WEDDING_NOT_FOUND, 03_API_spec.md §2)."""
    wedding = (await session.execute(select(Wedding))).scalar_one_or_none()
    if wedding is None:
        raise HTTPException(status_code=404, detail={"error": {"code": "WEDDING_NOT_FOUND"}})
    return wedding
