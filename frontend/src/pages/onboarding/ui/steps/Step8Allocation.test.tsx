// 8단계 배분 초과 가드의 **화면 쪽 계약**을 고정한다(2026-08-28). 버튼을 실제로 막는 것과
// 제출 payload는 OnboardingPage.test.tsx가 본다 — 여기선 "초과일 때 무엇이 보이고, 그 자리에서
// 총예산을 고칠 수 있는가"만 다룬다.
//
// 회귀 배경: 예전엔 배분 합계가 총예산을 넘어도 "N원 초과" 텍스트 한 줄만 바뀌고 아무것도
// 막지 않았다. 그 값이 그대로 나가 서버가 400 BUDGET_EXCEEDED를 냈고, 사용자는 온보딩을
// 끝까지 채우고 "시작하기"를 눌러야 그 사실을 알았다.
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Step8Allocation } from "./Step8Allocation";
import type { AllocationRow } from "./Step7CategoryToggle";

const BUDGET_LABEL = "총 예산(만원)";
const OVER_MESSAGE = "설정한 예산이 총예산을 초과했어요.";
const CTA = "총예산 금액을 조정할까요?";

/**
 * 초과 블록은 **사라질 때도 전환이 돌아야 해서** 마운트를 유지하고 `display` 로만 들고 난다 —
 * 그래서 "DOM 에 있는가"로는 보임 여부를 판정할 수 없다. jsdom 은 Tailwind 스타일시트를 로드하지
 * 않아 `toBeVisible()` 로도 알 수 없으므로(계산된 display 가 늘 기본값이다) 클래스로 본다.
 */
function expectOverBlock(shown: boolean) {
  const block = screen.getByText(OVER_MESSAGE).parentElement;
  expect(block).not.toBeNull();
  expect(block?.classList.contains("hidden")).toBe(!shown);
}

function row(overrides: Partial<AllocationRow> = {}): AllocationRow {
  return {
    categoryCode: "VENUE",
    nameKo: "예식장",
    hasCost: true,
    displayOrder: 1,
    isActive: true,
    plannedBudget: 0,
    selectedOptions: [],
    ...overrides,
  };
}

const onTotalBudgetChange = vi.fn();

/**
 * 부모(OnboardingPage)가 하는 일을 그대로 흉내 낸다 — 총예산을 state로 들고, 인라인 입력이
 * 돌려준 원 단위 문자열로 갱신한다. `NumberInput`은 로컬 초안이 없는 완전 제어 컴포넌트라
 * (그 파일 머리말) 값을 되돌려주지 않으면 타이핑이 한 글자에서 멈춘다 — 정적 prop으로 고정하면
 * 실제 화면과 다른 것을 검증하게 된다.
 */
function Harness({ rows, initialTotalBudget }: { rows: AllocationRow[]; initialTotalBudget: number }) {
  const [totalBudgetEstimate, setTotalBudgetEstimate] = useState(initialTotalBudget);
  const allocatedBudget = rows.filter((r) => r.isActive).reduce((sum, r) => sum + r.plannedBudget, 0);
  return (
    <Step8Allocation
      rows={rows}
      onRowsChange={() => {}}
      totalBudgetEstimate={totalBudgetEstimate}
      allocatedBudget={allocatedBudget}
      isOverAllocated={allocatedBudget > totalBudgetEstimate}
      onTotalBudgetChange={(wonString) => {
        onTotalBudgetChange(wonString);
        setTotalBudgetEstimate(wonString === "" ? 0 : Number(wonString));
      }}
    />
  );
}

describe("Step8Allocation — 배분 초과 안내", () => {
  it("초과가 아니면 초과 블록이 숨어 있다", () => {
    render(<Harness rows={[row({ plannedBudget: 8_000_000 })]} initialTotalBudget={10_000_000} />);

    expectOverBlock(false);
    expect(screen.getByText("2,000,000원 남음")).toBeInTheDocument();
  });

  it("정확히 총예산만큼 배분한 경계는 초과가 아니다", () => {
    render(<Harness rows={[row({ plannedBudget: 10_000_000 })]} initialTotalBudget={10_000_000} />);

    expectOverBlock(false);
    expect(screen.getByText("0원 남음")).toBeInTheDocument();
  });

  it("초과하면 문구·CTA와 함께 '나중에 설정'이 배분을 지운다는 사실을 미리 알린다", () => {
    render(<Harness rows={[row({ plannedBudget: 12_000_000 })]} initialTotalBudget={10_000_000} />);

    expectOverBlock(true);
    expect(screen.getByRole("button", { name: CTA })).toBeInTheDocument();
    // 조용히 지우면 10단계의 "0원 배분"이 버그로 읽힌다 — 누르기 전에 한 번 알린다.
    expect(screen.getByText(/‘나중에 설정’을 누르면 배분한 금액이 모두 지워져요\./u)).toBeInTheDocument();
    expect(screen.getByText("2,000,000원 초과")).toBeInTheDocument();
  });

  // 비활성 카테고리의 금액은 합계에 들어가지 않는다(payload에서도 0으로 나간다 —
  // allocationRowsToCategoryUpdates). 7단계에서 껐다가 8단계로 온 경우가 이 조합을 만든다.
  it("꺼둔 카테고리에 금액이 남아 있어도 초과로 보지 않는다", () => {
    render(
      <Harness
        rows={[row({ plannedBudget: 8_000_000 }), row({ categoryCode: "SDM", nameKo: "스드메", isActive: false, plannedBudget: 9_000_000 })]}
        initialTotalBudget={10_000_000}
      />,
    );

    expectOverBlock(false);
    expect(screen.queryByLabelText("스드메 예산 금액")).not.toBeInTheDocument();
  });
});

// 전환·`inert`·포커스 링 잘림 같은 **클래스 계약**은 2026-08-29에 shared/ui 로 올라갔다 —
// `StatusCallout.test.tsx` · `DisclosurePanel.test.tsx` 가 그 불변식을 한 곳에서 지킨다.
// 여기 남은 것은 이 화면이 그 부품을 **어떻게 배선했는가**뿐이다.
describe("Step8Allocation — 총예산 인라인 수정", () => {
  // 접힘/펼침이 애니메이션을 타려면 패널이 계속 마운트돼 있어야 한다 — 그래서 "DOM 에 있는가"로는
  // 열림 여부를 판정할 수 없다. 접힌 동안 실제로 지켜야 하는 계약은 두 가지다: 트리거의
  // `aria-expanded` 가 상태를 말하고, 안쪽이 `inert` 라 탭 순서·접근성 트리에서 빠지는 것.
  // (높이 0으로 잘리는 것 자체는 CSS 라 jsdom 이 계산하지 않아 여기서 볼 수 없다.)
  it("총예산 표시가 펼침 트리거다 — 접힌 동안에는 입력이 inert 라 닿을 수 없다", async () => {
    render(<Harness rows={[row({ plannedBudget: 8_000_000 })]} initialTotalBudget={10_000_000} />);
    const trigger = screen.getByRole("button", { name: "총예산 10,000,000원 수정" });
    const inertWrapper = () => screen.getByLabelText(BUDGET_LABEL).closest("[inert]");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(inertWrapper()).not.toBeNull();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(inertWrapper()).toBeNull();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(inertWrapper()).not.toBeNull();
  });

  it("CTA를 누르면 입력이 열리고 포커스까지 옮겨간다", async () => {
    render(<Harness rows={[row({ plannedBudget: 12_000_000 })]} initialTotalBudget={10_000_000} />);

    await userEvent.click(screen.getByRole("button", { name: CTA }));

    // 카드 아래 CTA에서 열리는 경로라 포커스를 옮기지 않으면 키보드 사용자는 펼쳐진 칸을
    // 찾아 다시 Tab 해야 한다.
    expect(screen.getByLabelText(BUDGET_LABEL)).toHaveFocus();
  });

  it("총예산을 올리면 초과 문구가 사라지고 분모도 즉시 따라간다", async () => {
    onTotalBudgetChange.mockClear();
    render(<Harness rows={[row({ plannedBudget: 12_000_000 })]} initialTotalBudget={10_000_000} />);
    await userEvent.click(screen.getByRole("button", { name: CTA }));

    const input = screen.getByLabelText(BUDGET_LABEL);
    await userEvent.clear(input);
    await userEvent.type(input, "1500");

    // 만원 단위로 입력하고 부모는 원 단위 문자열을 받는다(TotalBudgetField가 경계에서 변환).
    expect(onTotalBudgetChange).toHaveBeenLastCalledWith("15000000");
    expect(input).toHaveValue("1,500");
    expectOverBlock(false);
    expect(screen.getByText("3,000,000원 남음")).toBeInTheDocument();
  });

  it("기준 총예산이 0이면 입력을 0이 아니라 빈 칸으로 연다", async () => {
    // 총예산 미정 + 벤치마크 조회 실패로 분모가 0인 상태. 0을 채우면 "0원으로 시작한다"는
    // 거짓말이 된다(Step2RegionBudget.tsx의 benchmarkManwon과 같은 근거).
    render(<Harness rows={[row()]} initialTotalBudget={0} />);

    await userEvent.click(screen.getByRole("button", { name: "총예산 0원 수정" }));

    expect(screen.getByLabelText(BUDGET_LABEL)).toHaveValue("");
  });
});
