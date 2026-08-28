// handleSubmit 의 createWedding 단일 호출 회복력만 고정한다. 나머지 단계별 입력/검증은 각 Step
// 컴포넌트 소관 — 여기선 "나중에 설정"으로 9단계(확인)까지 바로 건너뛴 뒤 "시작하기"만 누른다.
//
// 2026-08-27 재설계 배경: 원래는 createWedding(9개 카테고리 전부 활성으로 생성+개인화)→
// putWeddingCategories(실제 온/오프로 다시 개인화 트리거)의 2콜 구조였다 — 온보딩마다 개인화 LLM
// 생성이 두 번 겹쳐 걸렸고(실측 Langfuse p95=45.9초), 그중 createWedding이 TIMEOUT/네트워크
// 에러로 실패하면 putWeddingCategories 가 아예 실행되지 않아 카테고리 활성화·예산 배분이 통째로
// 유실되는 CRITICAL 버그가 있었다(net::ERR_ABORTED로 실패한 것처럼 보였지만 서버는 이미 성공한
// 경우). 이제 카테고리를 createWedding의 categories 필드에 함께 실어 개인화를 한 번만 태운다 —
// putWeddingCategories는 온보딩 이후 수정에만 쓰이고 여기서는 더 이상 호출하지 않는다.
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
const putWeddingCategoriesFn = vi.fn();
const getCategoriesFn = vi.fn();
const getTotalAverageBenchmarkFn = vi.fn();
vi.mock("@/entities/wedding", () => ({
  createWedding: (...a: unknown[]) => createWeddingFn(...a),
  // 온보딩은 더 이상 이 함수를 호출하지 않는다 — 호출되지 않았음을 확인하는 용도로만 mock에 남긴다.
  putWeddingCategories: (...a: unknown[]) => putWeddingCategoriesFn(...a),
  getCategories: (...a: unknown[]) => getCategoriesFn(...a),
  getTotalAverageBenchmark: (...a: unknown[]) => getTotalAverageBenchmarkFn(...a),
}));

beforeEach(() => {
  navigate.mockReset();
  invalidateSessionFn.mockReset();
  createWeddingFn.mockReset();
  putWeddingCategoriesFn.mockReset();
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
    median_price: 30_000_000,
    min_price: 10_000_000,
    max_price: 80_000_000,
    sample_count: 100,
    source_url: "https://example.test",
  });
});
afterEach(() => vi.restoreAllMocks());

async function jumpToReviewAndSubmit() {
  render(<OnboardingPage />);
  await userEvent.click(await screen.findByRole("button", { name: "나중에 설정" }));
  await userEvent.click(await screen.findByRole("button", { name: "시작하기" }));
}

// 2단계까지 진행해 하객수 "미정이에요"만 켜고 제출한다. 총예산에도 같은 이름의 토글이 있어
// (Step2RegionBudget.tsx — 두 필드가 같은 미니 토글 패턴을 쓴다) 이름만으로는 못 고른다:
// DOM 순서상 두 번째(index 1)가 하객수 쪽이다.
async function toggleGuestCountUnsureAndSubmit() {
  render(<OnboardingPage />);
  await userEvent.click(await screen.findByRole("button", { name: "다음" }));
  const unsureToggles = await screen.findAllByRole("button", { name: "미정이에요" });
  await userEvent.click(unsureToggles[1]);
  await userEvent.click(await screen.findByRole("button", { name: "나중에 설정" }));
  await userEvent.click(await screen.findByRole("button", { name: "시작하기" }));
}

describe("온보딩 제출 — createWedding 단일 호출", () => {
  it("성공하면 categories를 함께 실어 보내고, 세션을 무효화한 뒤 홈으로 이동한다", async () => {
    createWeddingFn.mockResolvedValue({ id: "w1" });

    await jumpToReviewAndSubmit();

    expect(createWeddingFn).toHaveBeenCalledTimes(1);
    const payload = createWeddingFn.mock.calls[0][0] as {
      categories: unknown;
      guest_count: unknown;
      guest_count_unsure: unknown;
    };
    expect(Array.isArray(payload.categories)).toBe(true);
    // 하객수를 아예 보지 않고 건너뛴 경로 — 이전엔 필드를 안 보내 서버에 NULL로 저장됐다
    // (2026-08-28 사용자 지시로 기본값 200을 실어 보낸다). 미확정 신호는 플래그로 남긴다.
    expect(payload.guest_count).toBe(200);
    expect(payload.guest_count_unsure).toBe(true);
    expect(payload.categories).toEqual(
      expect.arrayContaining([expect.objectContaining({ category_code: "VENUE" })]),
    );
    expect(putWeddingCategoriesFn).not.toHaveBeenCalled();
    expect(invalidateSessionFn).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("409(WEDDING_ALREADY_EXISTS)는 이미 성공한 것으로 보고 그대로 진행한다", async () => {
    const { ApiError } = await import("@/shared/api");
    createWeddingFn.mockRejectedValue(
      new ApiError({ code: "WEDDING_ALREADY_EXISTS", message: "이미 존재합니다.", status: 409, extra: {} }),
    );

    await jumpToReviewAndSubmit();

    expect(invalidateSessionFn).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("TIMEOUT은 서버가 실제로 성공했을 수 있다고 보고 그대로 진행한다(핵심 회귀 케이스)", async () => {
    const { ApiError } = await import("@/shared/api");
    createWeddingFn.mockRejectedValue(
      new ApiError({ code: "TIMEOUT", message: "요청이 시간 초과되었습니다.", status: 0, extra: {} }),
    );

    await jumpToReviewAndSubmit();

    expect(invalidateSessionFn).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("NETWORK_ERROR는 진짜 실패로 보고 에러를 보여주며 페이지에 머문다", async () => {
    const { ApiError } = await import("@/shared/api");
    createWeddingFn.mockRejectedValue(
      new ApiError({ code: "NETWORK_ERROR", message: "서버에 연결하지 못했습니다.", status: 0, extra: {} }),
    );

    await jumpToReviewAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("서버에 연결하지 못했습니다.");
    expect(navigate).not.toHaveBeenCalled();
    expect(invalidateSessionFn).not.toHaveBeenCalled();
  });

  it("BUDGET_EXCEEDED 등 확정적 검증 실패는 에러를 보여주며 페이지에 머문다", async () => {
    const { ApiError } = await import("@/shared/api");
    createWeddingFn.mockRejectedValue(
      new ApiError({ code: "BUDGET_EXCEEDED", message: "배정 합계가 예산을 초과합니다.", status: 400, extra: {} }),
    );

    await jumpToReviewAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("배정 합계가 예산을 초과합니다.");
    expect(navigate).not.toHaveBeenCalled();
  });
});

// 하객수만 이 파일에서 별도로 고정하는 이유 — 화면 문구("200명으로 시작해요")와 실제 payload가
// 어긋난 채로 배포된 전력이 있다(과거엔 문구 쪽을 NULL 저장에 맞춰 되돌렸다). 두 값이 같은
// 상수에서 나오는지는 Step 컴포넌트 단독으로는 확인할 수 없어, 제출 payload를 보는 여기서 묶는다.
describe("온보딩 2단계 — 예상 하객 수 미정", () => {
  it("미정 토글을 켜면 기본값 200명과 미확정 플래그를 함께 보낸다", async () => {
    createWeddingFn.mockResolvedValue({ id: "w1" });

    await toggleGuestCountUnsureAndSubmit();

    expect(createWeddingFn).toHaveBeenCalledTimes(1);
    const payload = createWeddingFn.mock.calls[0][0] as { guest_count: unknown; guest_count_unsure: unknown };
    expect(payload.guest_count).toBe(200);
    expect(payload.guest_count_unsure).toBe(true);
  });

  it("미정 토글을 켜면 입력칸 placeholder와 안내 문구가 같은 200을 가리킨다", async () => {
    render(<OnboardingPage />);
    await userEvent.click(await screen.findByRole("button", { name: "다음" }));
    const guestInput = await screen.findByLabelText("예상 하객 수");
    expect(guestInput).not.toHaveAttribute("placeholder");

    await userEvent.click((await screen.findAllByRole("button", { name: "미정이에요" }))[1]);

    expect(guestInput).toHaveAttribute("placeholder", "200");
    expect(screen.getByText(/200명으로 시작해요/u)).toBeInTheDocument();
  });

  it("직접 입력한 하객수는 그대로 보내고 미확정 플래그를 세우지 않는다", async () => {
    createWeddingFn.mockResolvedValue({ id: "w1" });
    render(<OnboardingPage />);
    await userEvent.click(await screen.findByRole("button", { name: "다음" }));
    await userEvent.type(await screen.findByLabelText("예상 하객 수"), "250");
    await userEvent.click(await screen.findByRole("button", { name: "나중에 설정" }));
    await userEvent.click(await screen.findByRole("button", { name: "시작하기" }));

    const payload = createWeddingFn.mock.calls[0][0] as { guest_count: unknown; guest_count_unsure: unknown };
    expect(payload.guest_count).toBe(250);
    expect(payload.guest_count_unsure).toBe(false);
  });
});

// 총예산 미정 — 입력칸을 감추지 않고 비활성 상태로 남겨 지역 벤치마크 평균값을 채워 보인다
// (2026-08-28 사용자 지시). 채워 보이는 값은 **표시 전용**이라 부모 state/제출 payload에 새면
// 안 된다 — 화면 표시와 payload 계약을 같은 파일에서 묶어 고정하는 이유다(하객수 쪽과 같은 근거).
// mock 벤치마크는 median_price 30,000,000원, 지역 기본값은 SEOUL_OTHER("서울(강남 외)").
// "미정이에요" 토글은 DOM 순서상 첫 번째(index 0)가 총예산 쪽이다.
const BUDGET_LABEL = "총 예산(만원)";

async function goToStep2() {
  render(<OnboardingPage />);
  await userEvent.click(await screen.findByRole("button", { name: "다음" }));
  // 벤치마크 조회가 끝나야 안내 문구와 자동 채움 값이 나타난다.
  await screen.findByText(/평균 합산은/u);
}

async function toggleBudgetUnsure() {
  await userEvent.click((await screen.findAllByRole("button", { name: "미정이에요" }))[0]);
}

describe("온보딩 2단계 — 총 예산 미정", () => {
  it("미정이 아닐 때는 입력칸이 활성이고 문구가 참고값만 알린다", async () => {
    await goToStep2();

    expect(screen.getByLabelText(BUDGET_LABEL)).toBeEnabled();
    expect(
      screen.getByText("서울(강남 외) 지역 예식장+스드메 참가격 평균 합산은 30,000,000원 이에요."),
    ).toBeInTheDocument();
  });

  it("미정 토글을 켜면 입력칸이 사라지지 않고 비활성 상태로 평균값(만원)이 채워진다", async () => {
    await goToStep2();

    await toggleBudgetUnsure();

    const budgetInput = screen.getByLabelText(BUDGET_LABEL);
    expect(budgetInput).toBeDisabled();
    // 콤마가 붙은 표시 문자열이다(2026-08-28). 부모 state 는 여전히 원 단위 정수 문자열이다.
    expect(budgetInput).toHaveValue("3,000");
    expect(
      screen.getByText("서울(강남 외) 지역 예식장+스드메 참가격 평균 합산인 30,000,000원으로 설정됐어요."),
    ).toBeInTheDocument();
    expect(screen.getByText(/위 참고값으로 시작하고/u)).toBeInTheDocument();
  });

  it("표시 전용이다 — 미정을 껐다 켜도 사용자가 입력한 값이 그대로 남는다", async () => {
    await goToStep2();
    await userEvent.type(screen.getByLabelText(BUDGET_LABEL), "4500");

    await toggleBudgetUnsure();
    expect(screen.getByLabelText(BUDGET_LABEL)).toHaveValue("3,000");

    await toggleBudgetUnsure();
    const budgetInput = screen.getByLabelText(BUDGET_LABEL);
    expect(budgetInput).toBeEnabled();
    expect(budgetInput).toHaveValue("4,500");
  });

  it("미정으로 제출하면 total_budget 없이 미확정 플래그만 보낸다(서버가 벤치마크로 채운다)", async () => {
    createWeddingFn.mockResolvedValue({ id: "w1" });
    await goToStep2();
    await toggleBudgetUnsure();
    await userEvent.click(await screen.findByRole("button", { name: "나중에 설정" }));
    await userEvent.click(await screen.findByRole("button", { name: "시작하기" }));

    const payload = createWeddingFn.mock.calls[0][0] as { total_budget: unknown; total_budget_unsure: unknown };
    expect(payload.total_budget).toBeUndefined();
    expect(payload.total_budget_unsure).toBe(true);
  });
});
