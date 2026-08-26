// 예산을 아예 배정하지 않은(planned_budget=0) 카테고리에 지출이 생긴 경우의 회귀 테스트
// (사용자 신고, 2026-08-27) — 막대가 강제로 0%, 상단 금액도 0만원으로 보여 "아무 일도
// 안 일어난 것"처럼 보이던 버그. 이 파일 자체가 CategoryAllocationRow.tsx의 첫 테스트다.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { WeddingCategory } from "@/entities/wedding";
import { CategoryAllocationRow } from "./CategoryAllocationRow";

function category(overrides: Partial<WeddingCategory>): WeddingCategory {
  return {
    category_code: "HOMENEW",
    name_ko: "혼수",
    tier: "MOCKUP",
    is_active: true,
    planned_budget: 0,
    paid_amount: 0,
    remaining: 0,
    selected_options: null,
    display_order: 1,
    has_benchmark: false,
    has_vendor_cases: false,
    ...overrides,
  };
}

const BASE_PROPS = {
  hasCost: true,
  totalBudget: 45_000_000,
  hasBenchmark: false,
  benchmark: undefined,
  isEditingScenario: false,
  originalAmount: 0,
  onDraftChange: () => {},
};

describe("CategoryAllocationRow — 보기 모드", () => {
  it("정상 범위(배정 있음, 초과 아님)에서는 기존과 동일하게 배정액과 비율을 보여준다", () => {
    const row = category({ planned_budget: 12_000_000, paid_amount: 8_000_000 });
    render(<CategoryAllocationRow category={row} {...BASE_PROPS} />);

    expect(screen.getByText("1200만원")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "67");
    expect(screen.queryByText(/초과 지불/u)).not.toBeInTheDocument();
  });

  it("배정 있는 카테고리가 초과지출이면 막대는 100%로 클램프되고 초과분 문구가 뜬다", () => {
    const row = category({ planned_budget: 10_000_000, paid_amount: 15_000_000 });
    render(<CategoryAllocationRow category={row} {...BASE_PROPS} />);

    // 상단 금액은 여전히 배정액(1000만원)이다 — 이 경우는 버그 케이스가 아니다.
    expect(screen.getByText("1000만원")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("500만원 초과 지불")).toBeInTheDocument();
  });

  it("배정 0, 지출 0인 카테고리는 막대가 비어 있고 초과 문구도 없다(회귀 없음)", () => {
    const row = category({ planned_budget: 0, paid_amount: 0 });
    render(<CategoryAllocationRow category={row} {...BASE_PROPS} />);

    expect(screen.getByText("0만원")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.queryByText(/초과 지불/u)).not.toBeInTheDocument();
  });

  it("예산 미배정 카테고리에 지출이 생기면 막대가 채워지고 금액도 0이 아니다 — 버그 수정", () => {
    const row = category({ planned_budget: 0, paid_amount: 3_500_000 });
    render(<CategoryAllocationRow category={row} {...BASE_PROPS} />);

    // 상단 금액이 배정액(0)이 아니라 실지출액(350만원)을 보여준다 — B안(사용자 선택).
    expect(screen.getByText("350만원")).toBeInTheDocument();
    expect(screen.queryByText("0만원")).not.toBeInTheDocument();
    // 막대가 꽉 찬다 — "배정 전체가 초과"라는 뜻.
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    // 초과 문구에 회색 "예산 미배정" 보조 표기가 붙는다(사용자 지시).
    expect(screen.getByText("350만원 초과 지불")).toBeInTheDocument();
    expect(screen.getByText("- 예산 미배정")).toBeInTheDocument();
  });

  it("비용이 없는 카테고리는 기존처럼 '비용 없음'만 보여준다(회귀 없음)", () => {
    const row = category({ planned_budget: 0, paid_amount: 0 });
    render(<CategoryAllocationRow category={row} {...BASE_PROPS} hasCost={false} />);

    expect(screen.getByText("비용 없음")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
