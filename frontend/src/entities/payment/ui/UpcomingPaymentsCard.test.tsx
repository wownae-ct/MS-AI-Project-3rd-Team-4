// D-day-먼저 한 줄 형태 회귀 테스트(2026-08-27, 사용자 지시 — 예전엔 이 파일 자체가 없었다).
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UpcomingPaymentEntry } from "../model";
import { UpcomingPaymentsCard } from "./UpcomingPaymentsCard";

function entry(overrides: Partial<UpcomingPaymentEntry>): UpcomingPaymentEntry {
  return { id: "u1", category_code: "VENUE", item_name: "본식장 잔금", amount: 28_000_000, due_date: "2026-11-02", d_day: 32, ...overrides };
}

describe("UpcomingPaymentsCard", () => {
  it("D-day가 제목보다 먼저 나온다 — 한 줄", () => {
    render(<UpcomingPaymentsCard payments={[entry({})]} windowDays={30} />);
    const rowText = screen.getByRole("listitem").textContent ?? "";
    expect(rowText.indexOf("D-32")).toBeLessThan(rowText.indexOf("본식장 잔금"));
  });

  it("오늘(d_day=0)은 D-0이 아니라 '오늘'로 표시한다", () => {
    render(<UpcomingPaymentsCard payments={[entry({ d_day: 0 })]} windowDays={30} />);
    expect(screen.getByText(/오늘/u)).toBeInTheDocument();
  });

  it("빈 목록이면 카드 자체를 그리지 않는다", () => {
    render(<UpcomingPaymentsCard payments={[]} windowDays={30} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
