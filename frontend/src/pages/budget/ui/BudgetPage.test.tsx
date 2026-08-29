// 배분 초과 가드(2026-08-29 사용자 지시) — 온보딩 8단계가 2026-08-28에 받은 것과 같은 장치를
// 예산 재배분 화면에도 적용했다. 이 파일은 그 **게이트와 배선**만 본다(전환·`inert` 같은 클래스
// 불변식은 shared/ui 의 StatusCallout·DisclosurePanel 테스트가 한 곳에서 지킨다).
//
// ## 무엇이 회귀인가
//
// 예전엔 초과 상태로 "저장"을 누를 수 있었고, `PUT /wedding-categories`가 400 BUDGET_EXCEEDED를
// 낸 뒤에야 서버 메시지로 알 수 있었다 — 서버 왕복을 한 번 낭비하고, 고치려면 화면 맨 위
// 도넛까지 스크롤해 "수정"을 찾아야 했다.
//
// 🚨 서버의 초과 검증은 **`is_active` 무관, 전체 합**이다(01-endpoints.md:149). 화면의 도넛
// (`deriveBudgetSummary`)은 활성만 세므로 그걸로 게이트를 만들면 "화면은 통과인데 서버가 400"이
// 난다 — 아래 마지막 테스트가 그 갈림을 고정한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CategoryConstant, WeddingCategory } from "@/entities/wedding";
import { BudgetPage } from "./BudgetPage";

const getMyWeddingMock = vi.fn();
const getWeddingCategoriesMock = vi.fn();
const getCategoriesMock = vi.fn();
const putWeddingCategoriesMock = vi.fn();
const updateMyWeddingMock = vi.fn();

// `deriveBudgetSummary`는 실물을 쓴다 — 도넛이 그리는 숫자가 진짜 계산에서 나와야 이 화면의
// "초과" 판정과 도넛 문구가 어긋나는지 여기서 볼 수 있다.
vi.mock("@/entities/wedding", async (orig) => ({
  ...(await orig<typeof import("@/entities/wedding")>()),
  getMyWedding: () => getMyWeddingMock(),
  getWeddingCategories: () => getWeddingCategoriesMock(),
  getCategories: () => getCategoriesMock(),
  putWeddingCategories: (...a: unknown[]) => putWeddingCategoriesMock(...a),
  updateMyWedding: (...a: unknown[]) => updateMyWeddingMock(...a),
}));

vi.mock("@/entities/dashboard", async (orig) => ({
  ...(await orig<typeof import("@/entities/dashboard")>()),
  getDashboardSummary: () => Promise.resolve({ budget_benchmark: null }),
}));

vi.mock("@/entities/payment", async (orig) => ({
  ...(await orig<typeof import("@/entities/payment")>()),
  getUpcomingPayments: () => Promise.resolve({ payments: [] }),
  getPayments: () => Promise.resolve({ payments: [], total: 0 }),
  // 시세비교는 이 화면의 관심사가 아니다 — 항상 실패시켜 조용히 빠지게 둔다(훅이 allSettled 로 흡수).
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

/** 총예산과 카테고리 배열을 주고 화면이 뜰 때까지 기다린다. */
async function renderBudget(totalBudget: number, categories: WeddingCategory[], constants?: CategoryConstant[]) {
  getMyWeddingMock.mockResolvedValue({ total_budget: totalBudget });
  getWeddingCategoriesMock.mockResolvedValue({ categories });
  getCategoriesMock.mockResolvedValue({
    categories: constants ?? categories.map((c) => constant({ code: c.category_code, name_ko: c.name_ko, display_order: c.display_order })),
  });
  render(<BudgetPage />);
  await screen.findByRole("heading", { level: 2, name: "총 예산 현황" });
}

const TOTAL_PANEL_ID = "budget-total-edit";
const OVER_MESSAGE = "설정한 예산이 총예산을 초과했어요.";
const CTA = "총예산 금액을 조정할까요?";

/**
 * 초과 블록은 사라질 때도 전환이 돌아야 해서 마운트를 유지하고 `display` 로만 들고 난다 —
 * "DOM 에 있는가"로는 판정할 수 없다(jsdom 은 Tailwind 스타일시트를 로드하지 않아
 * `toBeVisible()` 로도 알 수 없다). 근거는 shared/ui/StatusCallout.tsx 머리말.
 */
function expectOverBlock(shown: boolean) {
  const block = screen.getByText(OVER_MESSAGE).parentElement;
  expect(block).not.toBeNull();
  expect(block?.classList.contains("hidden")).toBe(!shown);
}

/**
 * 시나리오 "저장" — 총예산 패널에도 같은 이름의 버튼이 있고, 그 패널은 **접혀 있어도 마운트를
 * 유지한다**(닫히는 애니메이션이 돌아야 해서. DisclosurePanel 머리말). `inert` 는 걸려 있지만
 * testing-library 의 접근성 필터가 그걸 보지 않아 이름만으로는 둘을 못 가른다 — 패널 밖의
 * 것으로 좁힌다.
 */
function scenarioSaveButton() {
  const button = screen
    .getAllByRole("button", { name: "저장" })
    .find((el) => el.closest(`#${TOTAL_PANEL_ID}`) === null);
  expect(button).toBeDefined();
  return button as HTMLElement;
}

/** 총예산 패널 안쪽 "저장". */
function panelSaveButton() {
  const panel = document.querySelector(`#${TOTAL_PANEL_ID}`);
  expect(panel).not.toBeNull();
  return within(panel as HTMLElement).getByRole("button", { name: "저장" });
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());

describe("예산 재배분 — 배분이 총예산을 넘을 때", () => {
  it("초과가 아니면 안내가 숨어 있고 저장도 열려 있다", async () => {
    await renderBudget(10_000_000, [category({ planned_budget: 8_000_000 })]);

    expectOverBlock(false);
    await userEvent.click(screen.getByRole("button", { name: "예산 조정하기" }));
    expect(scenarioSaveButton()).toBeEnabled();
  });

  it("정확히 총예산만큼 배정한 경계는 통과시킨다", async () => {
    await renderBudget(10_000_000, [category({ planned_budget: 10_000_000 })]);

    expectOverBlock(false);
    await userEvent.click(screen.getByRole("button", { name: "예산 조정하기" }));
    expect(scenarioSaveButton()).toBeEnabled();
  });

  it("초과면 편집 모드의 '저장'이 막히고, '뒤로'는 열려 있다", async () => {
    await renderBudget(10_000_000, [category({ planned_budget: 12_000_000 })]);
    await userEvent.click(screen.getByRole("button", { name: "예산 조정하기" }));

    expect(scenarioSaveButton()).toBeDisabled();
    // 배분을 더 내릴 수 없는 경우(paid_amount 하한)의 유일한 탈출구다 — 절대 막지 않는다.
    // `‹` 는 aria-hidden 이라 접근명은 "뒤로" 뿐이다.
    expect(screen.getByRole("button", { name: "뒤로" })).toBeEnabled();
    expect(putWeddingCategoriesMock).not.toHaveBeenCalled();
  });

  // 도넛의 "수정"으로 총예산만 낮추면 바로 이 상태가 된다 — PATCH /weddings/me 는 배분 합계를
  // 검증하지 않는다. 그 경로로 들어온 사용자에게도 고치는 길을 준다(2026-08-29 사용자 결정).
  it("보기 모드에서도 초과면 안내와 CTA가 뜬다", async () => {
    await renderBudget(10_000_000, [category({ planned_budget: 12_000_000 })]);

    expect(screen.getByRole("button", { name: "예산 조정하기" })).toBeInTheDocument();
    expectOverBlock(true);
    expect(screen.getByRole("button", { name: CTA })).toBeInTheDocument();
  });

  it("CTA를 누르면 총예산 패널이 열리고 입력에 포커스가 간다", async () => {
    await renderBudget(10_000_000, [category({ planned_budget: 12_000_000 })]);

    await userEvent.click(screen.getByRole("button", { name: CTA }));

    const input = screen.getByLabelText("총예산(만원)");
    expect(input.closest("[inert]")).toBeNull();
    expect(input).toHaveFocus();
    // 열리는 순간의 총예산이 만원 단위로 채워진다.
    expect(input).toHaveValue("1,000");
  });

  it("총예산을 올려 저장하면 안내가 사라지고 시나리오 저장이 풀린다", async () => {
    updateMyWeddingMock.mockResolvedValue({});
    await renderBudget(10_000_000, [category({ planned_budget: 12_000_000 })]);
    await userEvent.click(screen.getByRole("button", { name: "예산 조정하기" }));
    expect(scenarioSaveButton()).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: CTA }));
    const input = screen.getByLabelText("총예산(만원)");
    await userEvent.clear(input);
    await userEvent.type(input, "1500");

    await userEvent.click(panelSaveButton());

    expect(updateMyWeddingMock).toHaveBeenCalledWith({ total_budget: 15_000_000 });
    expectOverBlock(false);
  });

  // 🚨 서버는 `is_active` 무관 전체를 합산한다(01-endpoints.md:149). 활성만 세면 화면은
  // "미배정 200만원"이라 통과인데 저장이 400으로 튕긴다.
  it("비활성 카테고리의 배정액도 합산한다 — 서버와 같은 집합으로 판정한다", async () => {
    await renderBudget(
      10_000_000,
      [
        category({ planned_budget: 8_000_000 }),
        category({ category_code: "SDM", name_ko: "스드메", display_order: 2, is_active: false, planned_budget: 5_000_000 }),
      ],
      [constant(), constant({ code: "SDM", name_ko: "스드메", display_order: 2 })],
    );

    // 도넛(활성만)은 아직 여유가 있다고 말하지만, 전체 합(1,300만)은 총예산(1,000만)을 넘는다.
    expectOverBlock(true);
    await userEvent.click(screen.getByRole("button", { name: "예산 조정하기" }));
    expect(scenarioSaveButton()).toBeDisabled();
  });

  // 레드팀 감사 #21 잔여 — 비활성 카테고리는 목록에서 걸러 내면서(CategoryAllocationList) 합산엔
  // 넣기 때문에, 초과 안내의 **원인이 되는 행이 화면 어디에도 없는** 상태가 만들어진다.
  // 카테고리를 다시 켤 UI 도 없어(온보딩 7단계뿐) 그 금액을 0 으로 되돌릴 수단조차 없으므로,
  // 최소한 무엇이 남아 있는지는 말해 줘야 총예산 인상이 유일한 길임을 납득할 수 있다.
  it("초과의 원인이 화면 밖(비활성 카테고리)에 있으면 그 금액을 밝힌다", async () => {
    await renderBudget(
      10_000_000,
      [
        category({ planned_budget: 8_000_000 }),
        category({ category_code: "SDM", name_ko: "스드메", display_order: 2, is_active: false, planned_budget: 5_000_000 }),
      ],
      [constant(), constant({ code: "SDM", name_ko: "스드메", display_order: 2 })],
    );

    // 스드메 행 자체는 목록에 없다 — 그래서 이 문장이 아니면 1,300만이 어디서 왔는지 알 길이
    // 없다. (전역으로 찾으면 비용 관리 탭의 카테고리 `<option>`이 걸리므로 이 카드로 좁힌다.)
    const allocationCard = screen.getByRole("heading", { level: 2, name: "카테고리별 예산 현황" }).parentElement;
    expect(allocationCard).not.toBeNull();
    expect(within(allocationCard as HTMLElement).queryByText("스드메")).not.toBeInTheDocument();
    expect(screen.getByText(/사용 안 함 카테고리에/u)).toHaveTextContent("5,000,000원");
  });

  it("비활성 배정액이 0이면 그 문장을 내지 않는다", async () => {
    await renderBudget(
      10_000_000,
      [
        category({ planned_budget: 12_000_000 }),
        category({ category_code: "SDM", name_ko: "스드메", display_order: 2, is_active: false, planned_budget: 0 }),
      ],
      [constant(), constant({ code: "SDM", name_ko: "스드메", display_order: 2 })],
    );

    // 초과는 맞지만 원인이 전부 화면 안에 있다 — "0원이 남아 있어요"는 안내가 아니라 소음이다.
    expectOverBlock(true);
    expect(screen.queryByText(/사용 안 함 카테고리에/u)).not.toBeInTheDocument();
  });
});
