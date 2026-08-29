// 초과지출(paid+scheduled+allocated > total) 시 "미배정"이 음수로 찍히던 회귀를 고정한다.
// 원인/배경: docs/wedding/ing/todo.md, done.md 2026-08-26 — backend 가 결제 상한을 두지 않기로
// 결정해(캡 없음) unallocated = total - Σplanned_budget 가 음수로 내려올 수 있다. 프론트는 그
// 음수를 그대로 "미배정 -1,000,000원"으로 보여줬다 — 총액이 틀린 것처럼 오독된다.
//
// 4계열 전환(2026-08-28, red-bug.md #7) — `planned`/`remaining` 두 필드가 `scheduled`/`allocated`/
// `unallocated` 세 필드로 갈라졌다. 이 파일의 회귀 시나리오(초과지출 클램프) 자체는 그대로다 —
// 필드 이름과 계열 수만 맞춘다.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BudgetSummary } from "@/entities/wedding";
import { BudgetDonut } from "./BudgetDonut";

function summary(overrides: Partial<BudgetSummary>): BudgetSummary {
  return {
    total: 45_000_000,
    paid: 3_800_000,
    scheduled: 2_000_000,
    allocated: 38_200_000,
    unallocated: 1_000_000,
    ...overrides,
  };
}

// 2026-08-29: 총예산 수정 패널의 열림 상태가 BudgetPage 로 올라가면서 controlled props 두 개가
// 늘었다. 호출부마다 적으면 이 파일이 그 배선을 일곱 번 반복하게 되므로 기본값을 모아 둔다.
const BASE_PROPS = {
  onTotalBudgetSaved: () => {},
  benchmark: null,
  isEditing: false,
  onIsEditingChange: () => {},
};

describe("BudgetDonut", () => {
  it("정상 범위에서는 미배정 금액을 그대로 보여준다", () => {
    render(<BudgetDonut summary={summary({})} {...BASE_PROPS} />);
    expect(screen.getByText("1,000,000원")).toBeInTheDocument();
  });

  it("초과지출로 unallocated 가 음수여도 미배정은 0으로 표시한다 — 음수를 그대로 내면 오독된다", () => {
    const overspent = summary({ paid: 3_800_000, scheduled: 2_000_000, allocated: 40_200_000, unallocated: -1_000_000 });
    render(<BudgetDonut summary={overspent} {...BASE_PROPS} />);
    expect(screen.getByText("0원")).toBeInTheDocument();
    expect(screen.queryByText(/-1,000,000/u)).not.toBeInTheDocument();
  });

  it("초과지출이어도 도넛 gradient stop 이 100%를 넘지 않는다", () => {
    // RTL 렌더 결과가 돌려주는 감싸는 div 프로퍼티 중 하나는 이름이 진짜 Tailwind 유틸리티와
    // 겹친다 — 그 이름을 그대로 소스에 적으면(식별자든 주석이든) 평문으로 읽는 ghost-candidate
    // 스캐너가 걸린다(BudgetDonut.tsx 헤더 주석의 그 경고를 이 파일에서 한 번 더 재현할 뻔한
    // 사례 — 경고 주석 자체에 금지어를 적었다가 잡히는 재귀 실수를 피하려 이름을 안 적는다).
    // 같은 DOM 을 가리키는 다른 프로퍼티(`baseElement`)로 우회한다.
    const overspent = summary({ paid: 30_000_000, scheduled: 5_000_000, allocated: 20_000_000, unallocated: -10_000_000 });
    const { baseElement } = render(<BudgetDonut summary={overspent} {...BASE_PROPS} />);
    const donut = baseElement.querySelector<HTMLDivElement>("[style*='conic-gradient']");
    expect(donut).not.toBeNull();
    const background = donut?.style.background ?? "";
    const percentages = [...background.matchAll(/([\d.]+)%/gu)].map((m) => Number(m[1]));
    expect(percentages.every((p) => p <= 100)).toBe(true);
  });

  it("범례가 라벨과 금액을 텍스트로 함께 낸다 — 색으로만 구분하지 않는다(WCAG 1.4.1)", () => {
    render(<BudgetDonut summary={summary({})} {...BASE_PROPS} />);
    expect(screen.getByText("지불 완료")).toBeInTheDocument();
    expect(screen.getByText("지불 예정")).toBeInTheDocument();
    expect(screen.getByText("배정")).toBeInTheDocument();
    expect(screen.getByText("미배정")).toBeInTheDocument();
  });

  // 2026-08-29: 제목 옆 가로 폼(입력+만원+저장+취소)이 카드 하단 펼침 패널로 내려가고, 제목
  // 옆에는 트리거만 남았다. 보이는 글자는 "수정" 이지만 무엇을 펼치는지 말해 주지 않아
  // 접근명을 따로 준다("총예산 수정" — 보이는 문자열을 포함하므로 WCAG 2.5.3 을 지킨다).
  it("카드 제목 옆에 총예산 수정 펼침 트리거가 있다", () => {
    render(<BudgetDonut summary={summary({})} {...BASE_PROPS} />);
    expect(screen.getByRole("heading", { level: 2, name: "총 예산 현황" })).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "총예산 수정" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", "budget-total-edit");
  });
});

// 열림 상태는 BudgetPage 가 소유한다(초과 안내의 CTA 가 바깥에서 열어야 해서다) — 이 컴포넌트가
// 지켜야 할 계약은 "받은 값을 그대로 반영하고, 트리거를 누르면 반대값을 통지한다"까지다.
describe("BudgetDonut — 총예산 수정 패널", () => {
  it("닫혀 있으면 입력이 inert 라 탭으로 닿지 않는다", () => {
    render(<BudgetDonut summary={summary({})} {...BASE_PROPS} isEditing={false} />);
    // 접히는 애니메이션이 돌려면 마운트를 유지해야 한다 — DOM 에는 늘 있다(DisclosurePanel 머리말).
    expect(screen.getByLabelText("총예산(만원)").closest("[inert]")).not.toBeNull();
  });

  it("열리면 inert 가 풀리고 현재 총예산이 만원 단위로 채워진다", () => {
    render(<BudgetDonut summary={summary({ total: 45_000_000 })} {...BASE_PROPS} isEditing />);
    const input = screen.getByLabelText("총예산(만원)");
    expect(input.closest("[inert]")).toBeNull();
    expect(input).toHaveValue("4,500");
    expect(screen.getByRole("button", { name: "총예산 수정" })).toHaveAttribute("aria-expanded", "true");
  });

  it("트리거를 누르면 열림 여부를 부모에게 통지한다 — 스스로 열지 않는다", async () => {
    const onIsEditingChange = vi.fn();
    render(<BudgetDonut summary={summary({})} {...BASE_PROPS} onIsEditingChange={onIsEditingChange} />);

    await userEvent.click(screen.getByRole("button", { name: "총예산 수정" }));

    expect(onIsEditingChange).toHaveBeenCalledWith(true);
  });

  // PATCH /weddings/me 의 total_budget 변경은 개인화 LLM 을 재트리거한다(01-endpoints.md:141).
  // 초과 안내의 CTA 가 이 경로를 전면에 내세우게 되어 미리 알린다.
  it("총예산 변경이 느릴 수 있다는 사실을 패널이 알린다", () => {
    render(<BudgetDonut summary={summary({})} {...BASE_PROPS} isEditing />);
    expect(screen.getByText(/맞춤 추천을 다시 만드느라 잠시 걸릴 수 있어요/u)).toBeInTheDocument();
  });
});

// 대시보드 "예산 시세 비교" 카드(BudgetBenchmarkCard.tsx, 삭제됨)에서 이전된 테스트 — UX 개편
// 3차(2026-08-26)로 이 값이 예산 페이지 "총 예산 현황" 카드 하단(예전 "총예산 …원 중 수정" 자리)
// 으로 옮겨왔다. 카드 제목 자체는 UX 개편 4차(2026-08-27)로 "예산 현황" → "총 예산 현황"이 됐다.
describe("BudgetDonut — 총예산 vs 지역 시세(benchmark)", () => {
  it("benchmark가 null이면(해당 지역 참가격 데이터 없음) 비교 문구 자체를 그리지 않는다", () => {
    render(<BudgetDonut summary={summary({})} {...BASE_PROPS} />);
    expect(screen.queryByText(/지역 시세 대비/u)).not.toBeInTheDocument();
  });

  it("benchmark가 있으면 중앙값·배율·시세 대비 수준을 보여준다", () => {
    render(
      <BudgetDonut
        summary={summary({})}
        {...BASE_PROPS}
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
