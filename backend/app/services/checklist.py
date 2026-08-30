"""checklist_items 조회/수정/생성. 03_API_spec.md #12-14.

이 세션 범위에서는 개인화 라우터 에이전트(LLM generate)를 구현하지 않는다 — 온보딩 시
checklist_items 생성은 03_API_spec.md #6이 명시한 대로 "비동기 트리거"만 남기고(services/
wedding.py의 TODO(personalization-task)), 실제 생성은 후속 태스크에서 채운다. 그래서 이
모듈은 CRUD·상태값 검증만 다룬다 — 생성 로직은 없다."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChecklistItem

GENERAL_STATUSES: frozenset[str] = frozenset({"TODO", "DOING", "SKIP", "DONE"})
HOMEWARE_STATUSES: frozenset[str] = frozenset({"LISTED", "COMPARING", "ORDERED", "DELIVERED"})

# 2026-08-29 — 예전엔 이 값들이 아래 두 함수 안에 리터럴로만 있었다. app/services/
# personalization.py::_checklist_protected_clause가 "status가 기본값이 아니다"를 SQL 조건식으로
# 표현해야 해서(파이썬 함수 호출로는 컬럼 값에 분기할 수 없다) 상수로 뽑아 단일 출처로 만든다.
HOMEWARE_CATEGORY_CODE = "HOMEWARE"
HOMEWARE_DEFAULT_STATUS = "LISTED"
GENERAL_DEFAULT_STATUS = "TODO"


def valid_statuses_for_category(category_code: str) -> frozenset[str]:
    """04_DB_schema.sql CHECK와 1:1 — HOMEWARE(혼수)만 다른 4단계 상태값을 쓴다."""
    return HOMEWARE_STATUSES if category_code == HOMEWARE_CATEGORY_CODE else GENERAL_STATUSES


def default_status_for_category(category_code: str) -> str:
    return (
        HOMEWARE_DEFAULT_STATUS
        if category_code == HOMEWARE_CATEGORY_CODE
        else GENERAL_DEFAULT_STATUS
    )


def is_valid_status_for_category(category_code: str, status: str) -> bool:
    return status in valid_statuses_for_category(category_code)


async def list_checklist_items(
    session: AsyncSession,
    wedding_id: UUID,
    category_code: str | None = None,
    item_type: str | None = None,
) -> list[ChecklistItem]:
    stmt = select(ChecklistItem).where(ChecklistItem.wedding_id == wedding_id)
    if category_code is not None:
        stmt = stmt.where(ChecklistItem.category_code == category_code)
    if item_type is not None:
        stmt = stmt.where(ChecklistItem.item_type == item_type)
    stmt = stmt.order_by(ChecklistItem.display_order)
    return list((await session.execute(stmt)).scalars().all())


async def get_checklist_item(
    session: AsyncSession, wedding_id: UUID, item_id: UUID
) -> ChecklistItem | None:
    stmt = select(ChecklistItem).where(
        ChecklistItem.id == item_id, ChecklistItem.wedding_id == wedding_id
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def update_checklist_item(
    session: AsyncSession,
    item: ChecklistItem,
    status: str | None,
    memo: str | None,
) -> ChecklistItem:
    if status is not None:
        item.status = status
    if memo is not None:
        item.memo = memo
    item.user_edited_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(item)
    return item


async def create_checklist_item(
    session: AsyncSession,
    wedding_id: UUID,
    category_code: str,
    item_type: str,
    group_label: str,
    title: str,
    body: str | None,
    priority: str,
    option_group: str | None,
    tag: str | None,
) -> ChecklistItem:
    item = ChecklistItem(
        wedding_id=wedding_id,
        category_code=category_code,
        origin="USER",
        status=default_status_for_category(category_code),
        item_type=item_type,
        option_group=option_group,
        group_label=group_label,
        title=title,
        body=body,
        priority=priority,
        tag=tag,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item
