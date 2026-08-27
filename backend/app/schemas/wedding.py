"""#6-10 — 03_API_spec.md ① 웨딩 핵심. 온보딩(웨딩 프로필 생성/조회/수정)과 카테고리 On/Off·
예산 배분. v4.0: wedding_id는 항상 세션에서 서버가 유도(11_v3_to_v4_diff.md §2-5) — URL/body
파라미터로 절대 받지 않는다."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.core.categories import CATEGORY_META
from app.schemas.common import CategoryCode, CategoryTier

DatePrecision = Literal[
    "EXACT",
    "APPROX_H2_THIS_YEAR",
    "APPROX_H1_NEXT_YEAR",
    "APPROX_H2_NEXT_YEAR",
    "APPROX_H1_YEAR_AFTER_NEXT",
    "NO_PLAN",
]
UserRole = Literal["BRIDE", "GROOM"]
TastePreference = Literal["MINIMAL", "BUDGET", "GRAND", "BALANCED"]
VenuePriority = Literal["FOOD", "LOCATION", "PARKING", "CAPACITY"]
SdmPriority = Literal["DRESS", "PHOTO", "MAKEUP"]


# WeddingCreate.categories와 WeddingCategoriesUpdate.categories(#10)가 공유하는 행 shape이라
# WeddingCreate보다 먼저 정의한다 — 아래 model_validator가 카테고리 코드 커버리지를 검사할 때
# 쓰는 기준 집합도 같이 둔다.
class WeddingCategoryUpdateItem(BaseModel):
    category_code: CategoryCode
    is_active: bool
    planned_budget: int = Field(ge=0)
    display_order: int
    selected_options: list[str] | None = None
    skip_reason: str | None = None


_ALL_CATEGORY_CODES = frozenset(meta.code for meta in CATEGORY_META)


class WeddingCreate(BaseModel):
    user_role: UserRole
    wedding_date: date | None = None
    wedding_date_precision: DatePrecision
    total_budget: int | None = Field(default=None, gt=0)
    total_budget_unsure: bool = False
    region_code: str
    guest_count: int | None = Field(default=None, ge=0)
    guest_count_unsure: bool = False
    taste_preference: TastePreference | None = None
    venue_priority: VenuePriority | None = None
    sdm_priority: SdmPriority | None = None
    primary_goals: list[str] = Field(default_factory=list)
    # timeline_items 초기 상태 1회성 반영에만 쓰이고 저장은 안 된다(03_API_spec.md #6) —
    # timeline_items가 아직 없어(별도 태스크) 지금은 받기만 하고 처리하지 않는다.
    # TODO(timeline-task): done_so_far에 담긴 카테고리의 target_date<오늘 항목을 DONE으로.
    done_so_far: list[CategoryCode] = Field(default_factory=list)
    # 2026-08-27 재설계 — 온보딩 개인화 LLM 생성을 웨딩당 1회로 줄이기 위해 카테고리 활성/예산
    # 배분을 생성 시점에 함께 받는다(이전엔 생성 직후 PUT /wedding-categories가 활성 카테고리
    # 변경을 감지해 개인화를 또 트리거했다 — 실측 Langfuse p95=45.9초짜리 호출이 온보딩마다
    # 두 번 겹쳤다. docs/AI-Sessions/wiki/dev-tasks/
    # 2026-08-27-onboarding-single-personalization-call-redesign.md 참고).
    categories: list[WeddingCategoryUpdateItem]

    @model_validator(mode="after")
    def _wedding_date_required_when_exact(self) -> "WeddingCreate":
        if self.wedding_date_precision == "EXACT" and self.wedding_date is None:
            raise ValueError("wedding_date_precision이 EXACT면 wedding_date가 필수입니다.")
        if not self.total_budget_unsure and self.total_budget is None:
            raise ValueError("total_budget_unsure가 false면 total_budget이 필수입니다.")
        # categories는 9개 카테고리(app/core/categories.py::CATEGORY_META)를 중복·누락 없이
        # 정확히 커버해야 한다 — 온보딩이 항상 전체 카테고리 집합을 알고 있으므로(GET /categories
        # 조회 후 프론트가 그 목록으로 배분 행을 만든다) 부분집합/중복은 요청 실수로 본다.
        codes = [item.category_code for item in self.categories]
        if len(codes) != len(_ALL_CATEGORY_CODES) or set(codes) != _ALL_CATEGORY_CODES:
            raise ValueError(
                f"categories는 카테고리 {len(_ALL_CATEGORY_CODES)}개를 중복·누락 없이 전부 포함해야 합니다."
            )
        return self


class WeddingUpdate(BaseModel):
    """부분 수정 — 보낸 필드만 갱신(03_API_spec.md #8)."""

    wedding_date: date | None = None
    wedding_date_precision: DatePrecision | None = None
    total_budget: int | None = Field(default=None, gt=0)
    total_budget_unsure: bool | None = None
    region_code: str | None = None
    guest_count: int | None = Field(default=None, ge=0)
    guest_count_unsure: bool | None = None
    taste_preference: TastePreference | None = None
    venue_priority: VenuePriority | None = None
    sdm_priority: SdmPriority | None = None
    primary_goals: list[str] | None = None


class WeddingOut(BaseModel):
    id: UUID
    user_role: UserRole
    wedding_date: date
    wedding_date_precision: DatePrecision
    total_budget: int
    total_budget_unsure: bool
    region_code: str
    guest_count: int | None
    guest_count_unsure: bool
    taste_preference: TastePreference | None
    venue_priority: VenuePriority | None
    sdm_priority: SdmPriority | None
    primary_goals: list[str] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class WeddingCategoryOut(BaseModel):
    category_code: CategoryCode
    name_ko: str
    tier: CategoryTier
    is_active: bool
    planned_budget: int
    paid_amount: int
    scheduled_amount: int
    remaining: int
    selected_options: list[str] | None
    display_order: int
    has_benchmark: bool
    has_vendor_cases: bool


class WeddingCategoriesOut(BaseModel):
    categories: list[WeddingCategoryOut]


class WeddingCategoriesUpdate(BaseModel):
    categories: list[WeddingCategoryUpdateItem]
