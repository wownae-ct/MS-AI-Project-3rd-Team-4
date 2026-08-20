"""#2-6 — 03_API_spec.md §3. 온보딩(웨딩 프로필 생성/조회/수정)과 카테고리 On/Off·예산 배분."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import CategoryCode, CategoryTier

DatePrecision = Literal[
    "EXACT", "APPROX_H2_THIS_YEAR", "APPROX_H1_NEXT_YEAR", "APPROX_H2_NEXT_YEAR", "NO_PLAN"
]
UserRole = Literal["BRIDE", "GROOM"]
TastePreference = Literal["MINIMAL", "BUDGET", "GRAND", "BALANCED"]
VenuePriority = Literal["FOOD", "LOCATION", "PARKING", "CAPACITY"]
SdmPriority = Literal["DRESS", "PHOTO", "MAKEUP"]


class WeddingCreate(BaseModel):
    wedding_date: date | None = None
    date_precision: DatePrecision
    total_budget: int = Field(gt=0)
    region_code: str
    guest_count: int | None = None
    user_role: UserRole
    taste_preference: TastePreference | None = None
    venue_priority: VenuePriority | None = None
    sdm_priority: SdmPriority | None = None
    completed_categories: list[CategoryCode] = Field(default_factory=list)

    @model_validator(mode="after")
    def _wedding_date_required_when_exact(self) -> "WeddingCreate":
        if self.date_precision == "EXACT" and self.wedding_date is None:
            raise ValueError("date_precision이 EXACT면 wedding_date가 필수입니다.")
        return self


class WeddingUpdate(BaseModel):
    """부분 수정 — 보낸 필드만 갱신(03_API_spec.md #4)."""

    wedding_date: date | None = None
    total_budget: int | None = Field(default=None, gt=0)
    region_code: str | None = None
    guest_count: int | None = None


class WeddingOut(BaseModel):
    id: UUID
    wedding_date: date
    # DB 컬럼명은 wedding_date_precision(04_DB_spec.md §4-(1))이지만 API 계약은 date_precision
    # (03_API_spec.md #2) — validation_alias로 ORM 애트리뷰트를 읽고 필드명으로 그대로 내보낸다.
    date_precision: DatePrecision = Field(validation_alias="wedding_date_precision")
    total_budget: int
    region_code: str
    guest_count: int | None
    user_role: UserRole
    taste_preference: TastePreference | None
    venue_priority: VenuePriority | None
    sdm_priority: SdmPriority | None
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class WeddingCategoryOut(BaseModel):
    category_id: int
    category_code: CategoryCode
    name_ko: str
    tier: CategoryTier
    is_active: bool
    planned_budget: int
    paid_amount: int
    remaining: int
    display_order: int
    has_benchmark: bool
    has_vendor_cases: bool


class WeddingCategoriesOut(BaseModel):
    categories: list[WeddingCategoryOut]


class WeddingCategoryUpdateItem(BaseModel):
    category_id: int
    is_active: bool
    planned_budget: int = Field(ge=0)
    display_order: int
    skip_reason: str | None = None


class WeddingCategoriesUpdate(BaseModel):
    categories: list[WeddingCategoryUpdateItem]
