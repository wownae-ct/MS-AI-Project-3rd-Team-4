// 배분 초과 가드(2026-08-28 사용자 지시)의 **버튼 게이팅과 제출 payload**를 고정한다.
// 화면 문구·펼침 동작은 steps/Step8Allocation.test.tsx가 본다 — 두 계층이 어긋난 전력이 있어
// (화면은 "미정 해제"처럼 보이는데 payload는 미정으로 나가는 부류) 여기서 payload까지 묶는다.
//
// OnboardingPage.test.tsx와 파일을 나눈 이유는 oxlint max-lines 300줄 상한이다 — 저쪽이 이미
// 한도에 가까웠다. 목킹 세트가 같아 중복이 생기지만, 상한을 넘기지 않으면서 두 관심사를
// 한 파일에 담을 방법이 없다.
//
// ## 무엇이 회귀인가
//
// 예전엔 카테고리 배분 합계가 총예산을 넘어도 아무것도 막지 않았다. "N원 초과" 텍스트 한 줄만
// 바뀌고 "다음"은 그대로 통과했고, 그 값이 `POST /weddings` 의 `planned_budget` 으로 나가
// 서버가 400 BUDGET_EXCEEDED 를 냈다(`sum(planned_budget) > total_budget`). 사용자는 온보딩을
// 끝까지 채우고 "시작하기"를 눌러야 그 사실을 알았고, 9단계 확인 화면은 "5,000만원 / 4,000만원"
// 으로 나란히 찍을 뿐 "초과"라는 말조차 하지 않았다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingPage } from "./OnboardingPage";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
}));

const invalidateSessionFn = vi.fn();
vi.mock("@/entities/session", () => ({
  invalidateSession: () => invalidateSessionFn(),
}));

const createWeddingFn = vi.fn();
const getCategoriesFn = vi.fn();
const getTotalAverageBenchmarkFn = vi.fn();
vi.mock("@/entities/wedding", () => ({
  createWedding: (...a: unknown[]) => createWeddingFn(...a),
  putWeddingCategories: vi.fn(),
  getCategories: (...a: unknown[]) => getCategoriesFn(...a),
  getTotalAverageBenchmark: (...a: unknown[]) => getTotalAverageBenchmarkFn(...a),
}));

// 벤치마크 중앙값 3,000만원 — 총예산 "미정"일 때 배분 진행률의 분모가 되는 값이다.
// 아래 테스트들이 "비우면 여기로 되돌아간다"를 전제로 금액을 고른다.
const BENCHMARK_MEDIAN = 30_000_000;

beforeEach(() => {
  navigate.mockReset();
  invalidateSessionFn.mockReset();
  createWeddingFn.mockReset();
  getCategoriesFn.mockReset();
  getTotalAverageBenchmarkFn.mockReset();
  getCategoriesFn.mockResolvedValue({
    categories: [
      {
        code: "VENUE",
        name_ko: "예식장",
        display_order: 1,
        tier: "FOCUS",
        has_cost: true,
        has_benchmark: true,
        has_vendor_cases: true,
        allows_custom_tag: false,
      },
    ],
  });
  getTotalAverageBenchmarkFn.mockResolvedValue({
    region_code: "SEOUL_OTHER",
    survey_month: "2026-07",
    median_price: BENCHMARK_MEDIAN,
    min_price: 10_000_000,
    max_price: 80_000_000,
    sample_count: 100,
    source_url: "https://example.test",
  });
});
afterEach(() => vi.restoreAllMocks());

const BUDGET_LABEL = "총 예산(만원)";
const AMOUNT_LABEL = "예식장 예산 금액";
const OVER_MESSAGE = "설정한 예산이 총예산을 초과했어요.";
const RESET_NOTE = /총예산을 넘어서 배분 금액을 비웠어요/u;

function nextButton() {
  return screen.getByRole("button", { name: "다음" });
}

/**
 * 초과 블록은 **사라질 때도 전환이 돌아야 해서** 마운트를 유지하고 `display` 로만 들고 난다 —
 * 그래서 "DOM 에 있는가"로는 보임 여부를 판정할 수 없다(jsdom 은 Tailwind 스타일시트를 로드하지
 * 않아 `toBeVisible()` 로도 알 수 없다). 근거는 Step8Allocation.tsx 의 OVER_SHOWN 주석.
 */
function expectOverBlock(shown: boolean) {
  const block = screen.getByText(OVER_MESSAGE).parentElement;
  expect(block).not.toBeNull();
  expect(block?.classList.contains("hidden")).toBe(!shown);
}

async function goToStep2() {
  render(<OnboardingPage />);
  await userEvent.click(await screen.findByRole("button", { name: "다음" }));
  // 벤치마크 조회가 끝나야 분모가 확정된다.
  await screen.findByText(/평균 합산은/u);
}

/**
 * 2→3→4→5→6→7→8. 각 클릭이 다음 단계를 렌더하므로 **순차여야 한다** — 병렬화할 수 없어
 * 루프(no-await-in-loop) 대신 풀어 쓴다.
 */
async function advanceToStep8() {
  await userEvent.click(nextButton());
  await userEvent.click(nextButton());
  await userEvent.click(nextButton());
  await userEvent.click(nextButton());
  await userEvent.click(nextButton());
  await userEvent.click(nextButton());
}

/** 만원 단위로 다시 채워 넣는다 — 기존 값 뒤에 이어 치면 자릿수가 붙어 버린다. */
async function retype(label: string, manwon: string) {
  const field = await screen.findByLabelText(label);
  await userEvent.clear(field);
  await userEvent.type(field, manwon);
}

describe("온보딩 8단계 — 배분이 총예산을 넘을 때", () => {
  it("초과하면 '다음'이 막히고 화면이 이유를 말한다", async () => {
    await goToStep2();
    await userEvent.type(screen.getByLabelText(BUDGET_LABEL), "1000");
    await advanceToStep8();
    await retype(AMOUNT_LABEL, "1200");

    expect(nextButton()).toBeDisabled();
    expectOverBlock(true);
  });

  it("정확히 총예산만큼 배분한 경계는 통과시킨다", async () => {
    await goToStep2();
    await userEvent.type(screen.getByLabelText(BUDGET_LABEL), "1000");
    await advanceToStep8();
    await retype(AMOUNT_LABEL, "1000");

    expect(nextButton()).toBeEnabled();
    expectOverBlock(false);
  });

  it("8단계에서 총예산을 그 자리에서 올리면 '다음'이 다시 풀린다", async () => {
    await goToStep2();
    await userEvent.type(screen.getByLabelText(BUDGET_LABEL), "1000");
    await advanceToStep8();
    // 벤치마크(3,000만원)보다 크게 잡는다 — 총예산 칸을 비우는 순간 분모가 벤치마크로
    // 되돌아가므로, 그보다 작으면 "비우기"만으로 초과가 풀려 검증이 무의미해진다.
    await retype(AMOUNT_LABEL, "4000");
    expect(nextButton()).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "총예산 금액을 조정할까요?" }));
    await retype(BUDGET_LABEL, "5000");

    expect(nextButton()).toBeEnabled();
    expectOverBlock(false);
  });

  // 🚨 핵심 회귀 — 여기서 미정 플래그를 내리지 않으면 payload가 `total_budget: undefined` +
  // `total_budget_unsure: true`로 나가 **방금 입력한 금액이 통째로 버려진다**(서버가 벤치마크로
  // 다시 채운다). 화면에서는 초과가 사라져 사용자는 고쳤다고 믿는데 저장은 안 고쳐진 상태다.
  it("총예산 미정이어도 8단계에서 금액을 넣으면 미정이 해제돼 그 금액이 저장된다", async () => {
    createWeddingFn.mockResolvedValue({ id: "w1" });
    await goToStep2();
    // "미정이에요" 토글은 DOM 순서상 첫 번째(index 0)가 총예산 쪽이다.
    await userEvent.click((await screen.findAllByRole("button", { name: "미정이에요" }))[0]);
    await advanceToStep8();
    await retype(AMOUNT_LABEL, "4000"); // 벤치마크 3,000만원 초과
    expect(nextButton()).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "총예산 금액을 조정할까요?" }));
    await retype(BUDGET_LABEL, "5000");
    await userEvent.click(nextButton());
    await userEvent.click(await screen.findByRole("button", { name: "시작하기" }));

    const payload = createWeddingFn.mock.calls[0][0] as { total_budget: unknown; total_budget_unsure: unknown };
    expect(payload.total_budget).toBe(50_000_000);
    expect(payload.total_budget_unsure).toBe(false);
  });

  it("초과 상태에서 '나중에 설정'을 누르면 배분만 0으로 지우고, 9단계가 그 사실을 알린다", async () => {
    createWeddingFn.mockResolvedValue({ id: "w1" });
    await goToStep2();
    await userEvent.type(screen.getByLabelText(BUDGET_LABEL), "1000");
    await advanceToStep8();
    await retype(AMOUNT_LABEL, "1200");

    await userEvent.click(screen.getByRole("button", { name: "나중에 설정" }));

    // 조용히 지우면 "0원 배분"이 버그로 읽힌다 — 9단계가 이유를 말한다.
    expect(screen.getByText(RESET_NOTE)).toBeInTheDocument();
    expect(screen.getByText("0원 / 10,000,000원")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "시작하기" }));

    // 카테고리 on/off는 7단계에서 내린 별개의 결정이다 — 같이 지우지 않는다.
    const payload = createWeddingFn.mock.calls[0][0] as { categories: unknown };
    expect(payload.categories).toEqual([
      expect.objectContaining({ category_code: "VENUE", planned_budget: 0, is_active: true }),
    ]);
  });

  it("배분을 다시 만지면 9단계의 '비웠어요' 안내가 사라진다 — 더는 사실이 아니다", async () => {
    await goToStep2();
    await userEvent.type(screen.getByLabelText(BUDGET_LABEL), "1000");
    await advanceToStep8();
    await retype(AMOUNT_LABEL, "1200");
    await userEvent.click(screen.getByRole("button", { name: "나중에 설정" }));
    expect(screen.getByText(RESET_NOTE)).toBeInTheDocument();

    // 화살표 span 은 aria-hidden 이라 접근명은 "이전" 뿐이다.
    await userEvent.click(screen.getByRole("button", { name: "이전" }));
    await retype(AMOUNT_LABEL, "800");
    await userEvent.click(nextButton());

    expect(screen.queryByText(RESET_NOTE)).not.toBeInTheDocument();
    expect(screen.getByText("8,000,000원 / 10,000,000원")).toBeInTheDocument();
  });
});
