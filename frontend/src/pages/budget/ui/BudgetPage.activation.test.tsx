// 사용 여부 저장의 **대기 화면**(2026-08-29 개편, 사용자 지시).
//
// `BudgetPage.test.tsx` 와 파일을 가른 이유는 `eslint/max-lines`(300) 다 — 그 파일은 초과 게이트와
// 결제 선택지로 이미 상한에 닿아 있다. 화면은 같지만 보는 계약이 다르다: 저 파일은 **게이트와
// 배선**, 이 파일은 **저장이 도는 46초 동안 무엇이 보이는가**.
//
// 이 PUT 은 서버에서 체크리스트·타임라인 재생성을 동기로 돌린다(실측 p95 약 46초). 예전엔 그
// 46초 내내 토글 패널이 열려 있었다 — 정작 궁금한 「내 예산 목록이 어떻게 바뀌나」를 못 본 채
// 기다리다 어느 순간 목록이 통째로 갈렸다(D21 이 타임라인·체크리스트에서 기각한 그 상황).
//
// 두 방향을 **다르게** 다루는 것이 이 절의 핵심이다.
//   · 켜기 — 결과를 서버만 안다. 그 자리에 자리표시를 세우고 기다린다(지어내지 않는다).
//   · 끄기 — 결과("행이 사라지고 예산이 0")를 프론트가 정확히 계산할 수 있다. 즉시 반영한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CategoryConstant, WeddingCategory } from "@/entities/wedding";
import { BudgetPage } from "./BudgetPage";

const getMyWeddingMock = vi.fn();
const getWeddingCategoriesMock = vi.fn();
const getCategoriesMock = vi.fn();
const putWeddingCategoriesMock = vi.fn();

// `deriveBudgetSummary` 는 실물을 쓴다 — 끄기의 낙관적 반영이 도넛 숫자까지 즉시 옮기는지
// 진짜 계산으로 봐야 한다.
vi.mock("@/entities/wedding", async (orig) => ({
  ...(await orig<typeof import("@/entities/wedding")>()),
  getMyWedding: () => getMyWeddingMock(),
  getWeddingCategories: () => getWeddingCategoriesMock(),
  getCategories: () => getCategoriesMock(),
  putWeddingCategories: (...a: unknown[]) => putWeddingCategoriesMock(...a),
}));

vi.mock("@/entities/dashboard", async (orig) => ({
  ...(await orig<typeof import("@/entities/dashboard")>()),
  getDashboardSummary: () => Promise.resolve({ budget_benchmark: null }),
}));

vi.mock("@/entities/payment", async (orig) => ({
  ...(await orig<typeof import("@/entities/payment")>()),
  getUpcomingPayments: () => Promise.resolve({ payments: [] }),
  getPayments: () => Promise.resolve({ payments: [], total: 0 }),
  getBenchmarkCompare: () => Promise.reject(new Error("no benchmark")),
}));

function category(overrides: Partial<WeddingCategory> = {}): WeddingCategory {
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
    display_order: 1,
    has_benchmark: false,
    has_vendor_cases: false,
    ...overrides,
  };
}

function constant(overrides: Partial<CategoryConstant> = {}): CategoryConstant {
  return {
    code: "VENUE",
    name_ko: "예식장",
    display_order: 1,
    tier: "FOCUS",
    has_cost: true,
    has_benchmark: false,
    has_vendor_cases: false,
    allows_custom_tag: false,
    ...overrides,
  };
}

const VENUE_ROW = category({ planned_budget: 1_000_000 });
const SDM_ROW = category({ category_code: "SDM", name_ko: "스드메", display_order: 2, planned_budget: 2_000_000 });
const HOMEWARE_OFF = category({
  category_code: "HOMEWARE",
  name_ko: "혼수",
  display_order: 3,
  is_active: false,
  planned_budget: 0,
});
const ROWS = [VENUE_ROW, SDM_ROW, HOMEWARE_OFF];
const CONSTANTS = [
  constant(),
  constant({ code: "SDM", name_ko: "스드메", display_order: 2 }),
  constant({ code: "HOMEWARE", name_ko: "혼수", display_order: 3 }),
];

const AMOUNTS_PANEL_ID = "budget-category-amounts";
const ACTIVATION_PANEL_ID = "budget-category-activation";
const REGENERATING_NOTICE = "AI가 체크리스트와 타임라인을 다시 만들고 있어요.";

async function renderBudget() {
  getMyWeddingMock.mockResolvedValue({ total_budget: 10_000_000 });
  getWeddingCategoriesMock.mockResolvedValue({ categories: ROWS });
  getCategoriesMock.mockResolvedValue({ categories: CONSTANTS });
  render(<BudgetPage />);
  await screen.findByRole("heading", { level: 2, name: "총 예산 현황" });
}

/** 응답이 오지 않는 PUT — 대기 화면을 그 상태로 붙잡아 둔다. */
function neverSettles(): Promise<never> {
  return new Promise(() => {
    // 의도적으로 resolve 도 reject 도 하지 않는다.
  });
}

function amountsList() {
  const panel = document.querySelector(`#${AMOUNTS_PANEL_ID}`);
  expect(panel).not.toBeNull();
  return panel as HTMLElement;
}

function settingsButton() {
  return screen.getByRole("button", { name: "카테고리 사용 여부 설정" });
}

/**
 * 자리표시 개수. **role/label 로는 찾을 수 없다** — 자리표시는 장식이라 접근성 트리에서 통째로
 * 빠져 있다(`CategoryAllocationRow.tsx` 의 그 컴포넌트 머리말, `Skeleton.tsx` 와 같은 규칙).
 * 그래서 이 한 자리에서만 DOM 질의를 쓴다.
 */
function skeletonRowCount() {
  return amountsList().querySelectorAll("div[aria-hidden='true']").length;
}

/** 토글 → 저장 → 확인. 확인창은 확인 즉시 닫힌다(D21 결정 ②). */
async function saveActivation(categoryName: string) {
  await userEvent.click(settingsButton());
  await userEvent.click(screen.getByRole("switch", { name: `${categoryName} 카테고리 사용 여부` }));
  const panel = document.querySelector(`#${ACTIVATION_PANEL_ID}`);
  expect(panel).not.toBeNull();
  await userEvent.click(within(panel as HTMLElement).getByRole("button", { name: "저장" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "저장" }));
}

/** 진행 안내는 `StatusCallout` 이라 숨어도 DOM 에 남는다 — `display` 로 판정한다. */
function expectRegeneratingNotice(shown: boolean) {
  const block = screen.getByText(REGENERATING_NOTICE).parentElement;
  expect(block).not.toBeNull();
  expect(block?.classList.contains("hidden")).toBe(!shown);
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());

describe("예산 재배분 — 사용 여부 저장을 기다리는 동안", () => {
  it("켤 때는 기존 목록을 그대로 둔 채 그 자리에만 자리표시를 세운다", async () => {
    await renderBudget();
    putWeddingCategoriesMock.mockReturnValue(neverSettles());

    await saveActivation("혼수");

    // 토글 패널은 접히고 목록 본문으로 돌아왔다 — 기존 활성 행은 그대로다.
    expect(within(amountsList()).getByText("예식장")).toBeInTheDocument();
    expect(within(amountsList()).getByText("스드메")).toBeInTheDocument();
    // 켜는 카테고리의 이름은 아직 없다 — 그 결과는 서버만 안다. 자리만 잡는다.
    expect(within(amountsList()).queryByText("혼수")).not.toBeInTheDocument();
    expect(skeletonRowCount()).toBe(1);

    expectRegeneratingNotice(true);
    // 설정 버튼은 사라지고(자리만 남는다), 다른 편집 모드도 열 수 없다 — PUT 둘이 겹치면
    // 46초짜리 재생성이 겹친다.
    expect(screen.queryByRole("button", { name: "카테고리 사용 여부 설정" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "예산 조정하기" })).toBeDisabled();
  });

  it("응답이 오면 자리표시가 실제 행으로 바뀌고 설정 버튼이 돌아온다", async () => {
    await renderBudget();
    putWeddingCategoriesMock.mockResolvedValue({
      categories: [VENUE_ROW, SDM_ROW, { ...HOMEWARE_OFF, is_active: true }],
    });

    await saveActivation("혼수");

    expect(await within(amountsList()).findByText("혼수")).toBeInTheDocument();
    expect(skeletonRowCount()).toBe(0);
    expect(settingsButton()).toBeInTheDocument();
    expectRegeneratingNotice(false);
    // 자리표시가 실제 행으로 바뀌는 것은 눈에만 보이는 신호다 — 낭독은 이 한 줄이 낸다.
    expect(screen.getByText("카테고리 설정을 저장했어요.")).toBeInTheDocument();
  });

  // 끄기의 결과는 서버 규칙이 결정적이라 프론트가 정확히 계산할 수 있다(`applyDeactivations`).
  // 46초를 기다릴 이유가 없다 — 기다리게 하면 「빼는 일」이 「더하는 일」보다 비싸 보인다.
  it("끌 때는 응답을 기다리지 않고 즉시 목록에서 뺀다 — 자리표시도 세우지 않는다", async () => {
    await renderBudget();
    putWeddingCategoriesMock.mockReturnValue(neverSettles());

    await saveActivation("스드메");

    expect(within(amountsList()).queryByText("스드메")).not.toBeInTheDocument();
    expect(within(amountsList()).getByText("예식장")).toBeInTheDocument();
    expect(skeletonRowCount()).toBe(0);
    // 도넛도 같이 움직인다 — 끈 카테고리의 배정 200만원이 미배정으로 돌아간다(1,000만 − 100만).
    expect(screen.getByText("9,000,000원")).toBeInTheDocument();
    // 다만 서버는 아직 돌고 있다 — 그 사실을 감추지 않는다.
    expectRegeneratingNotice(true);
  });

  it("실패하면 목록을 되돌리고 만졌던 토글과 서버 문구를 함께 되살린다", async () => {
    await renderBudget();
    const { ApiError } = await import("@/shared/api");
    putWeddingCategoriesMock.mockRejectedValue(
      new ApiError({ code: "BUDGET_EXCEEDED", message: "배정 합계가 예산을 300만원 초과합니다.", status: 400, extra: {} }),
    );

    await saveActivation("스드메");

    expect(await screen.findByRole("alert")).toHaveTextContent("배정 합계가 예산을 300만원 초과합니다.");
    // 낙관적으로 뺐던 행이 돌아왔다.
    expect(within(amountsList()).getByText("스드메")).toBeInTheDocument();
    // 패널도 다시 열려 있고(그래서 설정 버튼은 여전히 감춰져 있다), 토글은 되돌리지 않는다 —
    // 다시 시도할 수 있어야 한다.
    expect(screen.queryByRole("button", { name: "카테고리 사용 여부 설정" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "스드메 카테고리 사용 여부" })).toHaveAttribute("aria-checked", "false");
  });
});
