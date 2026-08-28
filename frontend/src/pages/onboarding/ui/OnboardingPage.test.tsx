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

describe("온보딩 제출 — createWedding 단일 호출", () => {
  it("성공하면 categories를 함께 실어 보내고, 세션을 무효화한 뒤 홈으로 이동한다", async () => {
    createWeddingFn.mockResolvedValue({ id: "w1" });

    await jumpToReviewAndSubmit();

    expect(createWeddingFn).toHaveBeenCalledTimes(1);
    const payload = createWeddingFn.mock.calls[0][0] as { categories: unknown };
    expect(Array.isArray(payload.categories)).toBe(true);
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

// 2026-08-28 추가 — 9단계(자유 서술, custom_request) 신규 스텝의 제출 계약만 고정한다. 스텝
// 자체의 렌더링/글자수 카운터는 Step9CustomRequest.tsx 소관(다른 Step 컴포넌트들과 같은 관례 —
// 이 파일은 개별 스텝 UI가 아니라 handleSubmit의 최종 payload만 검증한다).
describe("9단계(자유 서술) — custom_request 제출 계약", () => {
  it("나중에 설정으로 건너뛰면(기존 동작) custom_request를 아예 보내지 않는다", async () => {
    createWeddingFn.mockResolvedValue({ id: "w1" });

    await jumpToReviewAndSubmit();

    const payload = createWeddingFn.mock.calls[0][0] as { custom_request?: string };
    expect(payload.custom_request).toBeUndefined();
  });

  it("입력한 값은 앞뒤 공백이 trim되어 custom_request로 실린다", async () => {
    createWeddingFn.mockResolvedValue({ id: "w1" });
    render(<OnboardingPage />);

    for (let i = 0; i < 8; i += 1) {
      await userEvent.click(await screen.findByRole("button", { name: "다음" }));
    }
    await userEvent.type(await screen.findByRole("textbox"), "  반려동물과 함께하는 결혼식을 준비하고 있어요.  ");
    await userEvent.click(await screen.findByRole("button", { name: "다음" }));
    await userEvent.click(await screen.findByRole("button", { name: "시작하기" }));

    expect(createWeddingFn).toHaveBeenCalledTimes(1);
    const payload = createWeddingFn.mock.calls[0][0] as { custom_request?: string };
    expect(payload.custom_request).toBe("반려동물과 함께하는 결혼식을 준비하고 있어요.");
  });
});
