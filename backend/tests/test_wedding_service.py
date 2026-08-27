"""app/services/wedding.py의 순수 로직(approximate_wedding_date, find_budget_below_paid_violation)
+ app/schemas/wedding.py의 WeddingCreate 검증기 — DB 없이 도는 것만."""

from datetime import date
from typing import ClassVar

import pytest
from pydantic import ValidationError

from app.core.categories import CATEGORY_META
from app.schemas.wedding import WeddingCreate
from app.services.wedding import approximate_wedding_date, find_budget_below_paid_violation

_ALL_ACTIVE_ZERO_BUDGET_CATEGORIES = [
    {
        "category_code": meta.code,
        "is_active": True,
        "planned_budget": 0,
        "display_order": meta.display_order,
    }
    for meta in CATEGORY_META
]


class TestApproximateWeddingDate:
    def test_h2_this_year_is_oct_1(self):
        assert approximate_wedding_date(date(2026, 8, 24), "APPROX_H2_THIS_YEAR") == date(
            2026, 10, 1
        )

    def test_h1_next_year_is_mar_15(self):
        assert approximate_wedding_date(date(2026, 8, 24), "APPROX_H1_NEXT_YEAR") == date(
            2027, 3, 15
        )

    def test_h2_next_year_is_sep_15(self):
        assert approximate_wedding_date(date(2026, 8, 24), "APPROX_H2_NEXT_YEAR") == date(
            2027, 9, 15
        )

    def test_h1_year_after_next_is_mar_15(self):
        assert approximate_wedding_date(date(2026, 8, 24), "APPROX_H1_YEAR_AFTER_NEXT") == date(
            2028, 3, 15
        )

    def test_no_plan_is_18_months_out(self):
        assert approximate_wedding_date(date(2026, 8, 24), "NO_PLAN") == date(2028, 2, 1)

    def test_no_plan_handles_year_rollover_from_december(self):
        assert approximate_wedding_date(date(2026, 12, 24), "NO_PLAN") == date(2028, 6, 1)


class TestWeddingCreateValidation:
    _base: ClassVar[dict] = {
        "user_role": "BRIDE",
        "wedding_date_precision": "EXACT",
        "wedding_date": "2027-05-15",
        "total_budget": 45_000_000,
        "region_code": "SEOUL_GANGNAM",
        "categories": _ALL_ACTIVE_ZERO_BUDGET_CATEGORIES,
    }

    def test_exact_precision_requires_wedding_date(self):
        payload = {**self._base, "wedding_date": None}
        with pytest.raises(ValidationError, match="wedding_date"):
            WeddingCreate(**payload)

    def test_approx_precision_does_not_require_wedding_date(self):
        payload = {**self._base, "wedding_date_precision": "NO_PLAN", "wedding_date": None}
        WeddingCreate(**payload)  # 예외 없이 통과해야 함

    def test_total_budget_required_when_not_unsure(self):
        payload = {**self._base, "total_budget": None, "total_budget_unsure": False}
        with pytest.raises(ValidationError, match="total_budget"):
            WeddingCreate(**payload)

    def test_total_budget_optional_when_unsure(self):
        payload = {**self._base, "total_budget": None, "total_budget_unsure": True}
        WeddingCreate(**payload)  # 예외 없이 통과해야 함


class TestWeddingCreateCategoriesValidation:
    """2026-08-27 재설계 — categories가 카테고리 9개(CATEGORY_META)를 중복·누락 없이 정확히
    커버해야 한다는 WeddingCreate의 새 불변식."""

    _base: ClassVar[dict] = {
        "user_role": "BRIDE",
        "wedding_date_precision": "EXACT",
        "wedding_date": "2027-05-15",
        "total_budget": 45_000_000,
        "region_code": "SEOUL_GANGNAM",
    }

    def test_exact_canonical_set_passes(self):
        payload = {**self._base, "categories": _ALL_ACTIVE_ZERO_BUDGET_CATEGORIES}
        WeddingCreate(**payload)  # 예외 없이 통과해야 함

    def test_missing_one_category_is_rejected(self):
        payload = {
            **self._base,
            "categories": [
                c for c in _ALL_ACTIVE_ZERO_BUDGET_CATEGORIES if c["category_code"] != "ETC"
            ],
        }
        with pytest.raises(ValidationError, match="categories"):
            WeddingCreate(**payload)

    def test_duplicate_category_code_is_rejected(self):
        # ETC를 하나 더 넣어 9개를 채우되(VENUE 대신 ETC 중복), 실제로는 VENUE가 빠진 셈이라
        # set 비교로 걸린다.
        duplicated = [
            c for c in _ALL_ACTIVE_ZERO_BUDGET_CATEGORIES if c["category_code"] != "VENUE"
        ]
        duplicated.append(dict(_ALL_ACTIVE_ZERO_BUDGET_CATEGORIES[0]))  # MEETING 중복
        payload = {**self._base, "categories": duplicated}
        with pytest.raises(ValidationError, match="categories"):
            WeddingCreate(**payload)

    def test_unknown_category_code_is_rejected_by_pydantic_literal(self):
        # category_code 자체가 Literal이라 목록 커버리지 검증(model_validator)까지 가기 전에
        # 필드 단위 타입 검증에서 이미 막힌다 — 그래도 "categories만 채우면 다 통과"라는
        # 오해를 방지하기 위해 명시적으로 고정한다.
        payload = {
            **self._base,
            "categories": [
                {**_ALL_ACTIVE_ZERO_BUDGET_CATEGORIES[0], "category_code": "NOT_A_CATEGORY"}
            ],
        }
        with pytest.raises(ValidationError):
            WeddingCreate(**payload)


class TestFindBudgetBelowPaidViolation:
    def test_no_violation_when_planned_covers_paid(self):
        assert (
            find_budget_below_paid_violation(
                {"VENUE": 18_000_000, "SDM": 5_000_000}, {"VENUE": 10_000_000}
            )
            is None
        )

    def test_violation_when_planned_drops_below_paid(self):
        assert find_budget_below_paid_violation({"VENUE": 8_000_000}, {"VENUE": 10_000_000}) == (
            "VENUE",
            10_000_000,
        )

    def test_category_with_no_payments_defaults_to_zero_paid(self):
        assert find_budget_below_paid_violation({"GIFT": 0}, {}) is None

    def test_equal_planned_and_paid_is_not_a_violation(self):
        assert (
            find_budget_below_paid_violation({"VENUE": 10_000_000}, {"VENUE": 10_000_000}) is None
        )

    def test_returns_first_violation_in_iteration_order(self):
        planned = {"VENUE": 1_000_000, "SDM": 2_000_000}
        paid = {"VENUE": 5_000_000, "SDM": 9_000_000}
        assert find_budget_below_paid_violation(planned, paid) == ("VENUE", 5_000_000)
