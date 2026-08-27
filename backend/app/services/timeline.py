"""timeline_items 생성/재계산/조회. 03_API_spec.md #6(온보딩 부작용), #8(wedding_date 변경
부작용), #15-17.

개인화 라우터 에이전트(13_personalization_router_agent_design.md) 자체는 이 세션 범위 밖이라,
지금은 app/core/timeline_catalog.py의 55항목 결정론적 카탈로그가 타임라인 생성의 유일한
경로다 — 나중에 LLM 개인화가 붙으면 이 모듈의 generate_timeline_items가 그 폴백 경로가 된다.

**2026-08-28 준비기간 스케일링 추가** (docs/wedding/refactor/bug-todo.md "S4 타임라인탭..."
항목, 5가지 결정 확정): 카탈로그/LLM 둘 다 원래 wedding_date만 기준으로 역산해 "오늘"(온보딩
시점)이 전혀 반영되지 않았다 — 준비기간이 짧은 사용자도 항상 D-12개월짜리 항목이 그대로
생성돼 가입 즉시 여러 항목이 overdue로 보이는 문제가 있었다. compute_prep_scale_factor/
scale_dday_offset이 이 스케일링을 담당하고, generate_timeline_items(카탈로그 경로)와
app/services/personalization.py::_timeline_row_from_draft(LLM 경로) 양쪽에 동일하게
적용한다 — 사용자 결정: 표준 준비기간 365일(웹 조사 근거: 예식장 10~12개월 전 예약 권장이
가장 흔한 기준, 카탈로그 최솟값 offset -365와도 일치), 준비기간이 길면 실제로 stretch(1.0
cap 아님), LLM 경로도 포함, wedding_date 변경 폭이 5개월(~150일) 이상일 때만 재스케일."""

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeline_catalog import TIMELINE_CATALOG
from app.models import TimelineItem, WeddingCategory

# 표준 준비기간(scale_factor=1.0 기준점) — 2026-08-28 사용자 결정, 근거는 모듈 docstring 참고.
BASELINE_PREP_DAYS = 365

# wedding_date 변경 폭이 이 이상(~5개월)일 때만 저장된 offset의 스케일 자체를 다시 계산한다.
# 그 미만이면 온보딩 시점 스케일을 그대로 고정 — 사소한 날짜 조정마다 TODO 항목 날짜가
# 요동치는 걸 막는다(2026-08-28 사용자 결정).
WEDDING_DATE_RESCALE_THRESHOLD_DAYS = 150


def compute_prep_scale_factor(today: date, wedding_date: date) -> float:
    """today부터 wedding_date까지 남은 일수를 BASELINE_PREP_DAYS 대비 비율로 반환한다 —
    준비기간이 짧으면 <1(압축), 길면 >1(stretch, 이 프로젝트가 명시적으로 선택한 정책). 남은
    기간이 0 이하(이미 지난 날짜 등 비정상 입력)로 나와 분모가 0/음수가 되는 걸 막기 위해
    최소 1일로 clamp한다."""
    remaining_days = max((wedding_date - today).days, 1)
    return remaining_days / BASELINE_PREP_DAYS


def scale_dday_offset(offset_days: int, scale_factor: float) -> int:
    """결혼식 이전 준비 항목(음수 offset)만 스케일하고, 결혼식 당일/이후 항목(혼인신고 등 양수
    offset)은 그대로 둔다 — 스케일할 '준비기간 밀도' 개념 자체가 없는 항목이라서다."""
    if offset_days >= 0:
        return offset_days
    return round(offset_days * scale_factor)


def rescale_offset_for_date_change(
    offset: int, old_wedding_date: date, new_wedding_date: date, onboarding_date: date, today: date
) -> int:
    """wedding_date가 크게 바뀌었을 때(recalculate_timeline_dates의
    WEDDING_DATE_RESCALE_THRESHOLD_DAYS 판정) 저장된 offset(온보딩 시점 스케일이 이미 반영된
    값)을 그 시점 스케일로 되돌린 뒤, 새 wedding_date·오늘 기준의 새 스케일을 다시 적용한다.
    양수 offset은 애초에 스케일 대상이 아니므로(scale_dday_offset과 동일 규칙) 그대로 둔다."""
    if offset >= 0:
        return offset
    old_scale_factor = compute_prep_scale_factor(onboarding_date, old_wedding_date)
    raw_offset = offset / old_scale_factor
    new_scale_factor = compute_prep_scale_factor(today, new_wedding_date)
    return round(raw_offset * new_scale_factor)


def generate_timeline_items(
    wedding_date: date, active_categories: set[str], done_so_far: list[str] | None, today: date
) -> list[dict]:
    """TIMELINE_CATALOG를 wedding_date 기준으로 역산해 온보딩 시 만들 timeline_items 초기 행을
    반환한다(DB I/O 없는 순수 함수). category_code가 있는 항목은 active_categories에 있을 때만
    포함, None(범용)은 항상 포함. done_so_far에 담긴 카테고리의 항목 중 target_date < today인
    것만 status='DONE'으로 1회성 반영(03_API_spec.md #6). 카탈로그 원본 offset은
    compute_prep_scale_factor로 today~wedding_date 실제 준비기간에 맞게 스케일된 뒤
    타임라인 항목 생성에 쓰인다.

    **2026-08-28 사용자 결정**: done_so_far의 "이미 지났다" 판정은 스케일 전(raw) offset 기준
    target_date로 한다 — 스케일된 target_date로 판정하면 카탈로그 최솟값 offset(-365)이 항상
    정확히 today로 스케일되는 수학적 성질 때문에 "생성 시점에 이미 과거인 항목"이 구조적으로
    존재할 수 없어져, 이 기능(준비기간이 짧은 사용자일수록 유용)이 사실상 무력화되기 때문이다.
    실제 저장/표시되는 target_date는 스케일된 값을 그대로 쓴다 — DONE 판정에만 raw를 쓴다."""
    scale_factor = compute_prep_scale_factor(today, wedding_date)
    done_categories = set(done_so_far or [])
    rows: list[dict] = []
    for item in TIMELINE_CATALOG:
        if item.category_code is not None and item.category_code not in active_categories:
            continue
        raw_target_date = wedding_date + timedelta(days=item.dday_offset_days)
        offset = scale_dday_offset(item.dday_offset_days, scale_factor)
        target_date = wedding_date + timedelta(days=offset)
        status = (
            "DONE" if item.category_code in done_categories and raw_target_date < today else "TODO"
        )
        rows.append(
            {
                "category_code": item.category_code,
                "origin": "LLM",
                "status": status,
                "title": item.title,
                "target_date": target_date,
                "default_dday_offset_days": offset,
                "date_overridden": False,
                "display_order": item.display_order,
            }
        )
    return rows


def recalculate_timeline_dates(
    old_wedding_date: date,
    new_wedding_date: date,
    onboarding_date: date,
    today: date,
    rows: list[tuple[UUID, int | None, bool, str]],
) -> dict[UUID, tuple[date, int]]:
    """wedding_date 변경 시 재계산 대상을 고른다(DB I/O 없는 순수 함수). 각 row는
    (id, default_dday_offset_days, date_overridden, status) — status='TODO'이고
    date_overridden=false이며 offset이 있는 행만 재계산(03_API_spec.md #8: DONE/date_overridden
    은 안 건드림). 반환값은 {id: (new_target_date, new_offset)} — 재스케일 시 offset 자체가
    바뀌므로(2026-08-28), target_date만 반환하면 호출부가 default_dday_offset_days 컬럼을
    갱신할 방법이 없어 target_date와 어긋난 채로 stale하게 남는다(실제로 재현된 버그 — 프론트
    phase-label 공식이 이 컬럼을 직접 쓰므로 target_date와 반드시 일치해야 한다).

    변경 폭이 WEDDING_DATE_RESCALE_THRESHOLD_DAYS 이상이면 rescale_offset_for_date_change로
    스케일 자체를 다시 계산하고, 그 미만이면 저장된 offset을 그대로 new_wedding_date에 더한다
    (온보딩 시점 스케일 고정, 기존 동작과 동일 — 이 경우 new_offset은 기존 offset과 같다)."""
    should_rescale = (
        abs((new_wedding_date - old_wedding_date).days) >= WEDDING_DATE_RESCALE_THRESHOLD_DAYS
    )
    updates: dict[UUID, tuple[date, int]] = {}
    for item_id, offset, overridden, status in rows:
        if overridden or status != "TODO" or offset is None:
            continue
        effective_offset = (
            rescale_offset_for_date_change(
                offset, old_wedding_date, new_wedding_date, onboarding_date, today
            )
            if should_rescale
            else offset
        )
        updates[item_id] = (new_wedding_date + timedelta(days=effective_offset), effective_offset)
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
