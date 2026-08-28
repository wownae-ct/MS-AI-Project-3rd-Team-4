"""#30 — 03_API_spec.md §7, 04_DB_spec.md §4-⑩. target_id는 DB FK가 아닌 다형 참조라
target_type에 맞는 테이블에서 존재+소유권(wedding_id)을 직접 확인해야 한다."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatMessage, ChatSession, ChecklistItem, FeedbackReport, TimelineItem
from app.schemas.common import FeedbackTargetType
from app.schemas.feedback import FeedbackReportCreate


async def target_exists_for_wedding(
    session: AsyncSession, wedding_id: UUID, target_type: FeedbackTargetType, target_id: UUID
) -> bool:
    """CHAT_MESSAGE는 자기 자신에 wedding_id가 없어(chat_sessions에 있음) 조인이 필요하다 —
    나머지 둘은 자기 테이블에 wedding_id가 직접 있어 조인 없이 확인 가능하다."""
    if target_type == "CHAT_MESSAGE":
        stmt = (
            select(ChatMessage.id)
            .join(ChatSession, ChatMessage.session_id == ChatSession.id)
            .where(ChatMessage.id == target_id, ChatSession.wedding_id == wedding_id)
        )
    elif target_type == "CHECKLIST_ITEM":
        stmt = select(ChecklistItem.id).where(
            ChecklistItem.id == target_id, ChecklistItem.wedding_id == wedding_id
        )
    else:  # TIMELINE_ITEM — FeedbackTargetType Literal이 이미 세 값으로만 검증해줌
        stmt = select(TimelineItem.id).where(
            TimelineItem.id == target_id, TimelineItem.wedding_id == wedding_id
        )
    return (await session.execute(stmt)).scalar_one_or_none() is not None


async def create_feedback_report(
    session: AsyncSession, wedding_id: UUID, payload: FeedbackReportCreate
) -> FeedbackReport:
    report = FeedbackReport(wedding_id=wedding_id, **payload.model_dump())
    session.add(report)
    await session.commit()
    await session.refresh(report)
    return report
