"""Phase 1 목 응답 전용 하드코딩 데이터(09_backend_implementation_plan.md Phase 1).
7개 카테고리 값은 실제 시드 마이그레이션(alembic/versions/7e1bfc107dc7_seed_categories.py)과
1:1로 맞춰뒀다 — 목 응답이라도 실제 DB로 교체될 때 값이 달라지는 일이 없게 하기 위해서다.
category.py/wedding.py/dashboard.py 등 여러 라우터가 같은 7행을 반복해서 하드코딩하지 않도록
한 곳에 모아둔다."""

from uuid import UUID

MOCK_WEDDING_ID = UUID("b3f1e2a0-0000-4000-8000-000000000001")

# (id, code, name_ko, display_order, tier, has_cost, has_benchmark, has_vendor_cases)
MOCK_CATEGORIES: list[tuple[int, str, str, int, str, bool, bool, bool]] = [
    (1, "MEETING", "상견례", 0, "MOCKUP", False, False, False),
    (2, "VENUE", "예식장", 1, "FOCUS", True, True, True),
    (3, "SDM", "스드메", 2, "FOCUS", True, True, True),
    (4, "GIFT", "예물·예단", 3, "MOCKUP", True, False, False),
    (5, "HOMEWARE", "혼수", 4, "MOCKUP", True, False, False),
    (6, "INVITATION", "청첩장·답례품", 5, "MOCKUP", True, False, False),
    (7, "HONEYMOON", "신혼여행", 6, "MOCKUP", True, False, False),
]
