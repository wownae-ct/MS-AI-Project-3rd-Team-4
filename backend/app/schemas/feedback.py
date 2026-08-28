"""#30 — 03_API_spec.md §7. AI 산출물(상담 답변/체크리스트/타임라인 항목) 신고."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import FeedbackReasonCategory, FeedbackStatus, FeedbackTargetType


class FeedbackReportCreate(BaseModel):
    target_type: FeedbackTargetType
    target_id: UUID
    reason_category: FeedbackReasonCategory
    comment: str | None = None


class FeedbackReportOut(BaseModel):
    id: UUID
    status: FeedbackStatus
    created_at: datetime
