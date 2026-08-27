// handleSubmit 의 createWedding→putWeddingCategories 순차 호출 회복력만 고정한다. 나머지
// 단계별 입력/검증은 각 Step 컴포넌트 소관 — 여기선 "나중에 설정"으로 9단계(확인)까지 바로
// 건너뛴 뒤 "시작하기"만 누른다.
//
// 회귀 배경(2026-08-27 staging 실사용 중 발견): createWedding 이 TIMEOUT/NETWORK_ERROR 로
// 실패해도 서버는 이미 웨딩 생성+개인화를 끝냈을 수 있다(net::ERR_ABORTED). 예전 코드는 409
// (WEDDING_ALREADY_EXISTS) 이외의 에러를 곧장 rethrow 해서 putWeddingCategories 가 아예
// 실행되지 않았고, 카테고리 활성화·예산 배분이 통째로 유실된 채 라우터 가드가 /onboarding
// 재진입까지 막아 복구 불가능한 상태가 됐다.
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

describe("온보딩 제출 — createWedding 실패 후 카테고리 저장 회복력", () => {
  it("createWedding이 TIMEOUT으로 실패해도 카테고리 저장을 시도하고, 성공하면 그대로 진행한다", async () => {
    const { ApiError } = await import("@/shared/api");
    createWeddingFn.mockRejectedValue(
      new ApiError({ code: "TIMEOUT", message: "요청이 시간 초과되었습니다.", status: 0, extra: {} }),
    );
    putWeddingCategoriesFn.mockResolvedValue({ categories: [] });

    await jumpToReviewAndSubmit();

    expect(putWeddingCategoriesFn).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/" }));
    expect(invalidateSessionFn).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("createWedding이 409(WEDDING_ALREADY_EXISTS)여도 여전히 카테고리 저장을 재시도한다", async () => {
    const { ApiError } = await import("@/shared/api");
    createWeddingFn.mockRejectedValue(
      new ApiError({ code: "WEDDING_ALREADY_EXISTS", message: "이미 존재합니다.", status: 409, extra: {} }),
    );
    putWeddingCategoriesFn.mockResolvedValue({ categories: [] });

    await jumpToReviewAndSubmit();

    expect(putWeddingCategoriesFn).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/" }));
  });

  it("createWedding과 카테고리 저장이 모두 실패하면 createWedding 쪽 에러를 더 정확한 원인으로 보여준다", async () => {
    const { ApiError } = await import("@/shared/api");
    createWeddingFn.mockRejectedValue(
      new ApiError({ code: "TIMEOUT", message: "요청이 시간 초과되었습니다.", status: 0, extra: {} }),
    );
    putWeddingCategoriesFn.mockRejectedValue(
      new ApiError({ code: "VALIDATION_ERROR", message: "카테고리 저장에 실패했습니다.", status: 422, extra: {} }),
    );

    await jumpToReviewAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("요청이 시간 초과되었습니다.");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("createWedding은 성공하고 카테고리 저장만 실패하면 카테고리 쪽 에러를 그대로 보여준다", async () => {
    const { ApiError } = await import("@/shared/api");
    createWeddingFn.mockResolvedValue({ id: "w1" });
    putWeddingCategoriesFn.mockRejectedValue(
      new ApiError({ code: "VALIDATION_ERROR", message: "카테고리 저장에 실패했습니다.", status: 422, extra: {} }),
    );

    await jumpToReviewAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("카테고리 저장에 실패했습니다.");
    expect(navigate).not.toHaveBeenCalled();
  });
});
