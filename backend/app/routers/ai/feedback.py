"""#30 — 03_API_spec.md §7. AI 산출물 신고 접수(F13). 관리자 검토(status 전이)는 이번
스코프 밖 — 03_API_spec.md #30 "Must 최소구현"."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import api_error
from app.deps import get_current_wedding
from app.models import Wedding
from app.schemas.feedback import FeedbackReportCreate, FeedbackReportOut
from app.services.feedback import create_feedback_report, target_exists_for_wedding

router = APIRouter(tags=["feedback"])


@router.post("/feedback-reports", response_model=FeedbackReportOut, status_code=201)
async def create_feedback_report_route(
    payload: FeedbackReportCreate,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> FeedbackReportOut:
    exists = await target_exists_for_wedding(
        session, wedding.id, payload.target_type, payload.target_id
    )
    if not exists:
        raise api_error(
            404,
            "FEEDBACK_TARGET_NOT_FOUND",
            f"{payload.target_type} {payload.target_id}를 찾을 수 없습니다.",
        )
    report = await create_feedback_report(session, wedding.id, payload)
    return FeedbackReportOut(id=report.id, status=report.status, created_at=report.created_at)
