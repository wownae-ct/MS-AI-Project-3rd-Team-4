"""timeline_items 생성/재계산/조회. 03_API_spec.md #6(온보딩 부작용), #8(wedding_date 변경
부작용), #15-17.

개인화 라우터 에이전트(13_personalization_router_agent_design.md) 자체는 이 세션 범위 밖이라,
지금은 app/core/timeline_catalog.py의 55항목 결정론적 카탈로그가 타임라인 생성의 유일한
경로다 — 나중에 LLM 개인화가 붙으면 이 모듈의 generate_timeline_items가 그 폴백 경로가 된다."""

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeline_catalog import TIMELINE_CATALOG
from app.models import TimelineItem, WeddingCategory


def generate_timeline_items(
    wedding_date: date, active_categories: set[str], done_so_far: list[str] | None, today: date
) -> list[dict]:
    """TIMELINE_CATALOG를 wedding_date 기준으로 역산해 온보딩 시 만들 timeline_items 초기 행을
    반환한다(DB I/O 없는 순수 함수). category_code가 있는 항목은 active_categories에 있을 때만
    포함, None(범용)은 항상 포함. done_so_far에 담긴 카테고리의 항목 중 target_date < today인
    것만 status='DONE'으로 1회성 반영(03_API_spec.md #6)."""
    done_categories = set(done_so_far or [])
    rows: list[dict] = []
    for item in TIMELINE_CATALOG:
        if item.category_code is not None and item.category_code not in active_categories:
            continue
        target_date = wedding_date + timedelta(days=item.dday_offset_days)
        status = "DONE" if item.category_code in done_categories and target_date < today else "TODO"
        rows.append(
            {
                "category_code": item.category_code,
                "origin": "LLM",
                "status": status,
                "title": item.title,
                "target_date": target_date,
                "default_dday_offset_days": item.dday_offset_days,
                "date_overridden": False,
                "display_order": item.display_order,
            }
        )
    return rows


def recalculate_timeline_dates(
    wedding_date: date, rows: list[tuple[UUID, int | None, bool, str]]
) -> dict[UUID, date]:
    """wedding_date 변경 시 재계산 대상을 고른다(DB I/O 없는 순수 함수). 각 row는
    (id, default_dday_offset_days, date_overridden, status) — status='TODO'이고
    date_overridden=false이며 offset이 있는 행만 재계산(03_API_spec.md #8: DONE/date_overridden
    은 안 건드림)."""
    updates: dict[UUID, date] = {}
    for item_id, offset, overridden, status in rows:
        if overridden or status != "TODO" or offset is None:
            continue
        updates[item_id] = wedding_date + timedelta(days=offset)
    return updates


def is_overdue(target_date: date, status: str, today: date) -> bool:
    return status == "TODO" and target_date < today


async def get_active_category_codes(session: AsyncSession, wedding_id: UUID) -> set[str]:
    stmt = select(WeddingCategory.category_code).where(
        WeddingCategory.wedding_id == wedding_id, WeddingCategory.is_active.is_(True)
    )
    return set((await session.execute(stmt)).scalars().all())


async def list_timeline_items(
    session: AsyncSession,
    wedding_id: UUID,
    active_category_codes: set[str],
    category_code: str | None = None,
) -> list[TimelineItem]:
    stmt = select(TimelineItem).where(TimelineItem.wedding_id == wedding_id)
    if category_code is not None:
        stmt = stmt.where(TimelineItem.category_code == category_code)
    stmt = stmt.order_by(TimelineItem.target_date)
    rows = list((await session.execute(stmt)).scalars().all())
    return [r for r in rows if r.category_code is None or r.category_code in active_category_codes]


async def get_timeline_item(
    session: AsyncSession, wedding_id: UUID, item_id: UUID
) -> TimelineItem | None:
    stmt = select(TimelineItem).where(
        TimelineItem.id == item_id, TimelineItem.wedding_id == wedding_id
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def update_timeline_item(
    session: AsyncSession,
    item: TimelineItem,
    target_date: date | None,
    status: str | None,
) -> TimelineItem:
    if target_date is not None:
        item.target_date = target_date
        item.date_overridden = True
    if status is not None:
        item.status = status
    item.user_edited_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(item)
    return item


async def create_timeline_item(
    session: AsyncSession,
    wedding_id: UUID,
    category_code: str | None,
    title: str,
    target_date: date,
) -> TimelineItem:
    item = TimelineItem(
        wedding_id=wedding_id,
        category_code=category_code,
        origin="USER",
        status="TODO",
        title=title,
        target_date=target_date,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item
