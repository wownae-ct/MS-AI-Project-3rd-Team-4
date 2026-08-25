// 초과지출(paid+planned > total) 시 "미배정"이 음수로 찍히던 회귀를 고정한다.
// 원인/배경: docs/wedding/ing/todo.md, done.md 2026-08-26 — backend 가 결제 상한을 두지 않기로
// 결정해(캡 없음) remaining = total - paid - planned 가 음수로 내려올 수 있다. 프론트는 그 음수를
// 그대로 "미배정 -1,000,000원"으로 보여줬다 — 총액이 틀린 것처럼 오독된다.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BudgetSummary } from "@/entities/wedding";
import { BudgetDonut } from "./BudgetDonut";

function summary(overrides: Partial<BudgetSummary>): BudgetSummary {
  return { total: 45_000_000, paid: 3_800_000, planned: 40_200_000, remaining: 1_000_000, ...overrides };
}

describe("BudgetDonut", () => {
  it("정상 범위에서는 미배정 금액을 그대로 보여준다", () => {
    render(<BudgetDonut summary={summary({})} />);
    expect(screen.getByText("1,000,000원")).toBeInTheDocument();
  });

  it("초과지출로 remaining 이 음수여도 미배정은 0으로 표시한다 — 음수를 그대로 내면 오독된다", () => {
    const overspent = summary({ paid: 3_800_000, planned: 42_200_000, remaining: -1_000_000 });
    render(<BudgetDonut summary={overspent} />);
    expect(screen.getByText("0원")).toBeInTheDocument();
    expect(screen.queryByText(/-1,000,000/u)).not.toBeInTheDocument();
  });

  it("초과지출이어도 도넛 gradient stop 이 100%를 넘지 않는다", () => {
    const overspent = summary({ paid: 30_000_000, planned: 25_000_000, remaining: -10_000_000 });
    const { container } = render(<BudgetDonut summary={overspent} />);
    const donut = container.querySelector<HTMLDivElement>("[style*='conic-gradient']");
    expect(donut).not.toBeNull();
    const background = donut?.style.background ?? "";
    const percentages = [...background.matchAll(/([\d.]+)%/gu)].map((m) => Number(m[1]));
    expect(percentages.every((p) => p <= 100)).toBe(true);
  });
});
