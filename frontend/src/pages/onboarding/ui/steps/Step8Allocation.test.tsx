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
    // 조용히 지우면 9단계의 "0원 배분"이 버그로 읽힌다 — 누르기 전에 한 번 알린다.
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

  // 사용자 요청(2026-08-28): 문구가 나타나고 사라질 때도 부드럽게. 라이브 리전 안이라 낭독을
  // 잃지 않아야 해서 `overflow-hidden`+높이 0 이 아니라 **display 토글**을 골랐다 — 내용이
  // 접근성 트리에서 실제로 들고 나야 스크린리더가 읽는다. display 는 이산 속성이라 그냥은
  // 전환되지 않으므로 `transition-discrete`(나갈 때)와 `starting:opacity-0`(들어올 때)이 둘 다
  // 있어야 양방향이 부드럽다 — 하나만 지우면 한쪽 방향이 조용히 툭 끊긴다. 그 짝을 고정한다.
  it("양방향 페이드의 짝이 유지된다 — display 토글 + 이산 전환 + 시작 스타일", () => {
    const { rerender } = render(<Harness rows={[row({ plannedBudget: 12_000_000 })]} initialTotalBudget={10_000_000} />);
    const block = () => screen.getByText(OVER_MESSAGE).parentElement;

    expect(block()).toHaveClass("opacity-100", "transition-discrete", "starting:opacity-0");
    expect(block()).toHaveClass("transition-[opacity,display]");

    rerender(<Harness rows={[row({ plannedBudget: 8_000_000 })]} initialTotalBudget={10_000_000} />);

    // 숨김 쪽에도 전환이 선언돼 있어야 사라지는 프레임이 돈다(선언이 없으면 즉시 사라진다).
    expect(block()).toHaveClass("hidden", "opacity-0", "transition-discrete");
    expect(block()).toHaveClass("transition-[opacity,display]");
    // `flex` 는 숨김 쪽에 없어야 한다 — 둘 다 display 유틸리티라 어느 쪽이 이기는지가 클래스
    // 나열 순서가 아니라 산출 CSS 순서로 정해진다.
    expect(block()).not.toHaveClass("flex");
  });

  // 🚨 사용자 신고(2026-08-28): 초과 → 미초과로 바뀔 때 "버벅거리며 사라진다".
  // 원인은 숨김 쪽에서 레이아웃 클래스까지 같이 뺐던 것 — `allow-discrete` 가 적용을 미뤄 주는
  // 것은 `display` 하나뿐이라, 사라지는 200ms 동안 요소는 아직 flex 인 채로 방향이 row 로,
  // gap 이 0 으로, 위 여백이 0 으로 즉시 튀었다(세 줄이 가로로 뭉치며 위로 점프). 두 상태가
  // display·opacity 말고는 완전히 같아야 한다.
  it("두 상태는 display 와 opacity 만 다르다 — 레이아웃이 달라지면 사라질 때 튄다", () => {
    const { rerender } = render(<Harness rows={[row({ plannedBudget: 12_000_000 })]} initialTotalBudget={10_000_000} />);
    const layoutOf = () => {
      const classes = screen.getByText(OVER_MESSAGE).parentElement?.className.split(" ") ?? [];
      // display(flex/hidden)와 opacity, 그리고 들어올 때만 쓰는 시작 스타일만 빼고 비교한다.
      return classes.filter((c) => !["flex", "hidden", "opacity-100", "opacity-0", "starting:opacity-0"].includes(c)).toSorted();
    };

    const shown = layoutOf();
    rerender(<Harness rows={[row({ plannedBudget: 8_000_000 })]} initialTotalBudget={10_000_000} />);

    expect(layoutOf()).toEqual(shown);
    // 대조군 — 비교에서 뺀 것들 말고 진짜 레이아웃 값이 들어 있는지(빈 배열끼리 같다면 무의미하다).
    expect(shown).toEqual(expect.arrayContaining(["mt-4", "flex-col", "gap-1.5"]));
  });
});

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

  it("펼침 상태가 클래스로 드러난다 — 높이를 0fr↔1fr 로 전환해 부드럽게 접힌다", async () => {
    // jsdom 은 전환을 실행하지 않으므로 "무엇을 전환하기로 했는가"까지만 고정한다. max-height
    // 매직 넘버로 되돌아가면(콘텐츠가 넘치면 잘린다) 이 테스트가 잡는다.
    render(<Harness rows={[row({ plannedBudget: 8_000_000 })]} initialTotalBudget={10_000_000} />);
    const trigger = screen.getByRole("button", { name: "총예산 10,000,000원 수정" });
    const panel = document.querySelector(`#${trigger.getAttribute("aria-controls") ?? ""}`);

    expect(panel).toHaveClass("grid-rows-[0fr]", "transition-[grid-template-rows]");

    await userEvent.click(trigger);

    expect(panel).toHaveClass("grid-rows-[1fr]", "transition-[grid-template-rows]");
  });

  // 사용자 신고(2026-08-28): 입력창을 누르면 포커스 링의 좌측·하단이 카드 틀에 잘렸다.
  // 원인은 애니메이션용 `overflow-hidden` — 높이만이 아니라 박스 밖 4px(styles.css 의
  // `:focus-visible` 이 2px 선을 2px 띄워 그린다)까지 함께 잘라낸다. 클리퍼를 카드 패딩만큼
  // 흘리고(`-mx-4`) 콘텐츠를 같은 값만큼
  // 되돌리는(`mx-4`) 짝으로 고쳤다 — **둘 중 하나만 지우면** 잘림이 돌아오거나(둘 다 제거)
  // 입력칸이 위쪽 문구와 어긋난다(되돌리기만 제거). jsdom 은 클리핑을 계산하지 않으므로
  // 그 짝이 유지되는지만 고정한다.
  it("포커스 링이 잘리지 않도록 클리퍼 흘림과 콘텐츠 되돌림이 짝을 이룬다", () => {
    render(<Harness rows={[row({ plannedBudget: 8_000_000 })]} initialTotalBudget={10_000_000} />);
    const trigger = screen.getByRole("button", { name: "총예산 10,000,000원 수정" });
    const panel = document.querySelector(`#${trigger.getAttribute("aria-controls") ?? ""}`);
    const content = screen.getByLabelText(BUDGET_LABEL).closest(".overflow-hidden")?.firstElementChild;

    expect(panel).toHaveClass("-mx-4"); // 카드 p-4 만큼 바깥으로
    expect(content).toHaveClass("mx-4"); // 같은 값만큼 되돌려 정렬 유지
    expect(content).toHaveClass("pb-1.5"); // 하단은 음수 마진을 못 쓴다(접힘이 깨진다) — 안쪽 여유로
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
