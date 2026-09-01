"""checklist_items 조회/수정/생성. 03_API_spec.md #12-14.

여기서 만드는 것은 **사용자가 직접 추가한 항목**뿐이다(origin="USER"). 온보딩과 프로필 변경
시점에 항목을 대량 생성하는 개인화 에이전트는 별개 경로다 — app/personalization의 LangGraph가
초안을 만들고 app/services/personalization.py가 DB에 반영한다.

상태값 규칙이 카테고리마다 다른 것(혼수는 구매 단계, 나머지는 진행 단계)도 이 모듈이 안다."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChecklistItem
from app.schemas.checklist import ChecklistItemCreate

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
    session: AsyncSession, wedding_id: UUID, payload: ChecklistItemCreate
) -> ChecklistItem:
    """사용자가 직접 추가하는 체크리스트 항목.

    2026-09-01 리팩토링 — 원래 payload 8필드를 낱개 인자로 풀어 받았다(총 10개). 유일한
    호출부(app/routers/wedding/checklist.py)는 이미 ChecklistItemCreate를 손에 쥔 채 그것을
    8개로 풀어서 위치 인자로 넘기고 있었고, 8개 중 대부분이 str/str|None이라 인접한
    group_label/title/body가 자리를 바꿔도 타입체커도 ruff도 잡지 못하는 구조였다. 이 레포의
    다른 서비스 함수(wedding/payment/feedback/chat)는 전부 스키마를 직접 받으므로 풀어쓰기
    쪽이 오히려 예외였다.

    origin/status는 payload에 없는 서버 결정값이라 여기서 채운다.
    """
    item = ChecklistItem(
        wedding_id=wedding_id,
        category_code=payload.category_code,
        origin="USER",
        status=default_status_for_category(payload.category_code),
        item_type=payload.item_type,
        option_group=payload.option_group,
        group_label=payload.group_label,
        title=payload.title,
        body=payload.body,
        priority=payload.priority,
        tag=payload.tag,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item
