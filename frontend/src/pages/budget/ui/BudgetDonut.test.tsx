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
    render(<BudgetDonut summary={summary({})} onTotalBudgetSaved={() => {}} benchmark={null} />);
    expect(screen.getByText("1,000,000원")).toBeInTheDocument();
  });

  it("초과지출로 remaining 이 음수여도 미배정은 0으로 표시한다 — 음수를 그대로 내면 오독된다", () => {
    const overspent = summary({ paid: 3_800_000, planned: 42_200_000, remaining: -1_000_000 });
    render(<BudgetDonut summary={overspent} onTotalBudgetSaved={() => {}} benchmark={null} />);
    expect(screen.getByText("0원")).toBeInTheDocument();
    expect(screen.queryByText(/-1,000,000/u)).not.toBeInTheDocument();
  });

  it("초과지출이어도 도넛 gradient stop 이 100%를 넘지 않는다", () => {
    // RTL 렌더 결과가 돌려주는 감싸는 div 프로퍼티 중 하나는 이름이 진짜 Tailwind 유틸리티와
    // 겹친다 — 그 이름을 그대로 소스에 적으면(식별자든 주석이든) 평문으로 읽는 ghost-candidate
    // 스캐너가 걸린다(BudgetDonut.tsx 헤더 주석의 그 경고를 이 파일에서 한 번 더 재현할 뻔한
    // 사례 — 경고 주석 자체에 금지어를 적었다가 잡히는 재귀 실수를 피하려 이름을 안 적는다).
    // 같은 DOM 을 가리키는 다른 프로퍼티(`baseElement`)로 우회한다.
    const overspent = summary({ paid: 30_000_000, planned: 25_000_000, remaining: -10_000_000 });
    const { baseElement } = render(<BudgetDonut summary={overspent} onTotalBudgetSaved={() => {}} benchmark={null} />);
    const donut = baseElement.querySelector<HTMLDivElement>("[style*='conic-gradient']");
    expect(donut).not.toBeNull();
    const background = donut?.style.background ?? "";
    const percentages = [...background.matchAll(/([\d.]+)%/gu)].map((m) => Number(m[1]));
    expect(percentages.every((p) => p <= 100)).toBe(true);
  });

  it("범례가 라벨과 금액을 텍스트로 함께 낸다 — 색으로만 구분하지 않는다(WCAG 1.4.1)", () => {
    render(<BudgetDonut summary={summary({})} onTotalBudgetSaved={() => {}} benchmark={null} />);
    expect(screen.getByText("지불 완료")).toBeInTheDocument();
    expect(screen.getByText("계획(미지급)")).toBeInTheDocument();
    expect(screen.getByText("미배정")).toBeInTheDocument();
  });

  it("카드 제목 옆에 총예산 수정 트리거가 있다", () => {
    render(<BudgetDonut summary={summary({})} onTotalBudgetSaved={() => {}} benchmark={null} />);
    expect(screen.getByRole("heading", { level: 2, name: "예산 현황" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수정" })).toBeInTheDocument();
  });
});

// 대시보드 "예산 시세 비교" 카드(BudgetBenchmarkCard.tsx, 삭제됨)에서 이전된 테스트 — UX 개편
// 3차(2026-08-26)로 이 값이 예산 페이지 "예산 현황" 카드 하단(예전 "총예산 …원 중 수정" 자리)
// 으로 옮겨왔다.
describe("BudgetDonut — 총예산 vs 지역 시세(benchmark)", () => {
  it("benchmark가 null이면(해당 지역 참가격 데이터 없음) 비교 문구 자체를 그리지 않는다", () => {
    render(<BudgetDonut summary={summary({})} onTotalBudgetSaved={() => {}} benchmark={null} />);
    expect(screen.queryByText(/지역 시세 대비/u)).not.toBeInTheDocument();
  });

  it("benchmark가 있으면 중앙값·배율·시세 대비 수준을 보여준다", () => {
    render(
      <BudgetDonut
        summary={summary({})}
        onTotalBudgetSaved={() => {}}
        benchmark={{
          region_code: "SEOUL_OTHER",
          median_price: 40_000_000,
          ratio_to_median: 1.125,
          percentile_label: "높음",
          source_url: "https://example.com/price-stat",
        }}
      />,
    );
    expect(screen.getByText("40,000,000원")).toBeInTheDocument();
    expect(screen.getByText("1.13배")).toBeInTheDocument();
    expect(screen.getByText(/지역 시세 대비 높음/u)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "출처 보기" })).toHaveAttribute("href", "https://example.com/price-stat");
  });
});
