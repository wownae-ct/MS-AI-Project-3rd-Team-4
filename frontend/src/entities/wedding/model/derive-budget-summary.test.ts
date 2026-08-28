import { describe, expect, it } from "vitest";
import type { WeddingCategory } from "./types";
import { deriveBudgetSummary } from "./derive-budget-summary";

function category(overrides: Partial<WeddingCategory>): WeddingCategory {
  return {
    category_code: "VENUE",
    name_ko: "예식장",
    tier: "FOCUS",
    is_active: true,
    planned_budget: 0,
    paid_amount: 0,
    scheduled_amount: 0,
    remaining: 0,
    selected_options: null,
    display_order: 0,
    has_benchmark: true,
    has_vendor_cases: false,
    ...overrides,
  };
}

describe("deriveBudgetSummary", () => {
  it("네 계열(지불완료·지불예정·배정·미배정)의 합이 정확히 총예산과 같다", () => {
    const categories = [
      category({ category_code: "VENUE", planned_budget: 12_000_000, paid_amount: 3_000_000, scheduled_amount: 2_000_000 }),
      category({ category_code: "SDM", planned_budget: 8_000_000, paid_amount: 800_000, scheduled_amount: 200_000 }),
    ];
    const summary = deriveBudgetSummary(categories, 45_000_000);

    expect(summary.paid + summary.scheduled + summary.allocated + summary.unallocated).toBe(45_000_000);
    expect(summary.paid).toBe(3_800_000);
    expect(summary.scheduled).toBe(2_200_000);
    // 배정 총액(20,000,000) - 지불(3,800,000) - 지불예정(2,200,000) = 배정(만 해둔 나머지)
    expect(summary.allocated).toBe(14_000_000);
    // 총예산(45,000,000) - 배정 총액(20,000,000) = 미배정
    expect(summary.unallocated).toBe(25_000_000);
  });

  it("비활성 카테고리는 계산에서 제외한다", () => {
    const categories = [
      category({
        category_code: "VENUE",
        is_active: true,
        planned_budget: 10_000_000,
        paid_amount: 1_000_000,
        scheduled_amount: 500_000,
      }),
      category({
        category_code: "MEETING",
        is_active: false,
        planned_budget: 5_000_000,
        paid_amount: 5_000_000,
        scheduled_amount: 5_000_000,
      }),
    ];
    const summary = deriveBudgetSummary(categories, 20_000_000);

    expect(summary.paid).toBe(1_000_000);
    expect(summary.scheduled).toBe(500_000);
    expect(summary.allocated).toBe(8_500_000);
  });

  it("총예산을 배정 총액보다 낮춘 상태(음수 미배정)를 클램프 없이 그대로 낸다 — 클램프는 소비자(BudgetDonut) 책임", () => {
    const categories = [category({ planned_budget: 30_000_000, paid_amount: 5_000_000 })];
    const summary = deriveBudgetSummary(categories, 20_000_000);

    expect(summary.unallocated).toBe(-10_000_000);
  });

  it("지불완료+지불예정이 배정액을 넘는 데이터 이상 상태에서도 배정은 음수로 내려가지 않는다", () => {
    const categories = [category({ planned_budget: 10_000_000, paid_amount: 8_000_000, scheduled_amount: 5_000_000 })];
    const summary = deriveBudgetSummary(categories, 10_000_000);

    expect(summary.allocated).toBe(0);
  });
});
