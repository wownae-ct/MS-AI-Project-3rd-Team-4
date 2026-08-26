"""대시보드 요약(#25)·마이 리포트(#26) 전용 집계. 03_API_spec.md §3-⑤.

카테고리 메타·예산 집계(planned_budget/paid_amount)는 app/services/wedding.py의
list_wedding_categories_out()을 그대로 재사용한다(GET /wedding-categories와 동일 계산, 단일
소스 유지) — 여기서는 그게 다루지 않는 체크리스트 진행률/우선순위 추천/다가오는 일정 결합
조회만 새로 짠다."""

from datetime import date
from uuid import UUID

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChecklistItem, PriceBenchmark, TimelineItem
from app.schemas.dashboard import DashboardBudgetBenchmarkOut
from app.services.benchmark import compute_ratio_and_label
from app.services.payment import compute_d_day

# 03_API_spec.md #25 field table: "checklist_items(status IN ('DOING','COMPARING','ORDERED'))".
# 04_DB_spec.md §3-6: 일반 카테고리의 DOING + 혼수(HOMEWARE)의 COMPARING/ORDERED를 "진행 중"으로
# 묶는다(DELIVERED는 제외) — 상태값 자체가 카테고리별로 다른 4단계라 이 셋의 합집합이 곧 그 정의.
UPCOMING_CHECKLIST_STATUSES = ("DOING", "COMPARING", "ORDERED")
DASHBOARD_UPCOMING_ITEMS_LIMIT = 5
NEXT_RECOMMENDED_CHECKS_LIMIT = 5


def build_budget_benchmark(
    total_budget: int, benchmark: PriceBenchmark | None
) -> DashboardBudgetBenchmarkOut | None:
    """total_budget을 지역별 TOTAL/TOTAL 참가격(benchmark, app/services/benchmark.py::
    get_latest_benchmark(session, region_code, "TOTAL", "TOTAL")로 미리 조회)과 비교한다 — 순수
    함수로 유지해 DB 세션 없이 결정론적으로 테스트한다(app/services/wedding.py::
    approximate_wedding_date()와 같은 컨벤션). 해당 지역에 아직 TOTAL/TOTAL 시드가 없으면
    benchmark가 None이고, 그대로 None을 돌려줘 대시보드 전체를 막지 않는다(카테고리별
    /benchmarks/compare(#23)가 BENCHMARK_NOT_AVAILABLE로 404하는 것과 달리, 이 필드는 애초에
    optional이라 500/404 없이 그냥 카드가 안 보이는 쪽을 택했다)."""
    if benchmark is None:
        return None
    ratio, label = compute_ratio_and_label(total_budget, benchmark.median_price)
    return DashboardBudgetBenchmarkOut(
        region_code=benchmark.region_code,
        median_price=benchmark.median_price,
        ratio_to_median=ratio,
        percentile_label=label,
        source_url=benchmark.source_url,
    )


async def get_checklist_progress_by_category(
    session: AsyncSession, wedding_id: UUID
) -> dict[str, float]:
    """카테고리별 체크리스트 완료율. "완료"의 정의가 카테고리마다 다르다 — 일반 8개는
    status='DONE', 혼수(HOMEWARE)는 status='DELIVERED'(app/services/checklist.py의 카테고리별
    상태값 분기와 동일 기준). 체크리스트가 아직 없는 카테고리(personalization 실패로 BLOCKED된
    직후 등)는 결과 dict에 아예 안 나타나므로, 호출부가 .get(code, 0.0)으로 0 취급해야 한다."""
    is_done = case(
        (
            (ChecklistItem.category_code == "HOMEWARE") & (ChecklistItem.status == "DELIVERED"),
            1,
        ),
        (
            (ChecklistItem.category_code != "HOMEWARE") & (ChecklistItem.status == "DONE"),
            1,
        ),
        else_=0,
    )
    stmt = select(ChecklistItem.category_code, is_done.label("done")).where(
        ChecklistItem.wedding_id == wedding_id
    )
    rows = (await session.execute(stmt)).all()

    totals: dict[str, int] = {}
    dones: dict[str, int] = {}
    for category_code, done in rows:
        totals[category_code] = totals.get(category_code, 0) + 1
        dones[category_code] = dones.get(category_code, 0) + done
    return {code: dones[code] / total for code, total in totals.items() if total > 0}


async def list_upcoming_items(
    session: AsyncSession, wedding_id: UUID, today: date, active_category_codes: set[str]
) -> list[dict]:
    """#25 upcoming_items — timeline_items(TODO, target_date 임박순)와 checklist_items(진행
    중)를 합쳐 최대 5개. 두 소스는 정렬 기준이 되는 정보가 다르다(날짜 vs 진행상태)는 게 스펙에
    명시된 전부라 교차 정렬 규칙은 없음 — 타임라인(날짜 임박순)을 먼저 채우고 남는 자리를
    체크리스트로 채우는 단순한 순서를 택했다.

    사용자가 끈(is_active=false) 카테고리의 항목은 제외한다 — 안 그러면 `categories` 필드에
    없는 category_code가 여기 섞여 들어와 프론트가 한글 라벨(name_ko)을 못 찾고 원문 ENUM을
    노출하게 된다(app/services/timeline.py::list_timeline_items와 동일 원칙). LIMIT 전에
    걸러야 상위 N개가 실제로 활성 카테고리 기준 상위 N개가 된다 — 조회 후 파이썬에서 거르면
    비활성 항목만큼 결과가 5개 미만으로 줄어들 수 있다."""
    timeline_stmt = (
        select(TimelineItem)
        .where(
            TimelineItem.wedding_id == wedding_id,
            TimelineItem.status == "TODO",
            (TimelineItem.category_code.is_(None))
            | (TimelineItem.category_code.in_(active_category_codes)),
        )
        .order_by(TimelineItem.target_date)
        .limit(DASHBOARD_UPCOMING_ITEMS_LIMIT)
    )
    checklist_stmt = (
        select(ChecklistItem)
        .where(
            ChecklistItem.wedding_id == wedding_id,
            ChecklistItem.status.in_(UPCOMING_CHECKLIST_STATUSES),
            ChecklistItem.category_code.in_(active_category_codes),
        )
        .order_by(ChecklistItem.display_order)
        .limit(DASHBOARD_UPCOMING_ITEMS_LIMIT)
    )
    timeline_items = list((await session.execute(timeline_stmt)).scalars().all())
    checklist_items = list((await session.execute(checklist_stmt)).scalars().all())

    combined = [
        {
            "source": "timeline",
            "id": item.id,
            "category_code": item.category_code,
            "title": item.title,
            "target_date": item.target_date,
            "d_day": compute_d_day(item.target_date, today),
        }
        for item in timeline_items
    ] + [
        {
            "source": "checklist",
            "id": item.id,
            "category_code": item.category_code,
            "title": item.title,
            "status": item.status,
        }
        for item in checklist_items
    ]
    return combined[:DASHBOARD_UPCOMING_ITEMS_LIMIT]


async def list_next_recommended_checks(
    session: AsyncSession, wedding_id: UUID, active_category_codes: set[str]
) -> list[ChecklistItem]:
    """#26 next_recommended_checks — priority='high'이면서 미완료 상태(일반: DONE/SKIP 아님,
    혼수: DELIVERED 아님)인 항목을 display_order 순으로 최대 5개. priority가 이미 'high' 하나로
    필터링돼 그 안에서 다시 priority로 정렬할 의미가 없어 display_order만 쓴다(03_API_spec.md
    #26: "priority, display_order 순"이지만 필터 후엔 사실상 display_order 단독과 동치).

    비활성 카테고리 항목은 제외 — list_upcoming_items와 동일 이유(ENUM 노출 방지)."""
    incomplete = (
        (ChecklistItem.category_code == "HOMEWARE") & (ChecklistItem.status != "DELIVERED")
    ) | (
        (ChecklistItem.category_code != "HOMEWARE") & ChecklistItem.status.not_in(("DONE", "SKIP"))
    )
    stmt = (
        select(ChecklistItem)
        .where(
            ChecklistItem.wedding_id == wedding_id,
            ChecklistItem.priority == "high",
            ChecklistItem.category_code.in_(active_category_codes),
            incomplete,
        )
        .order_by(ChecklistItem.display_order)
        .limit(NEXT_RECOMMENDED_CHECKS_LIMIT)
    )
    return list((await session.execute(stmt)).scalars().all())
