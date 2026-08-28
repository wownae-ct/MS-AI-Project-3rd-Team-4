// S2 대시보드 계약 (시각 스펙: docs/mockups/s2-dashboard.html).
//
// **무엇을 테스트하고 무엇을 테스트하지 않는가**
// 색·라운드·그림자는 빌드 게이트(산출 CSS 파서)가 이미 강제한다 — 여기서 클래스를 단언하지 않는다.
// 여기서 고정하는 것은 **CSS 로 검사할 수 없는 것**뿐이다: 문서 구조(제목 레벨) · 접근명 ·
// 색 이외의 전달 수단 · 셸과 화면의 소유 경계 · 실API 데이터 배선.
//
// 실API 연동(§5 인계 문서) 이후 `getDashboardSummary()`를 목으로 대체해야 한다. `CategoryRow`가
// `Link`도 쓰지만, `pages/**`는 `@/app`(routeTree)을 import할 수 없다(.oxlintrc.json 「pages는
// app과 다른 page를 import할 수 없다」) — 그래서 AppShell.test.tsx 처럼 실제 라우터 트리를 조립하지
// 않고, LoginPage.test.tsx 가 이미 쓰는 패턴대로 `@tanstack/react-router`의 `Link`만 목으로 바꾼다.
//
// **UX 개편(2026-08-26)** — 예산 도넛 카드를 예산 페이지로 옮겨서(BudgetDonut.test.tsx가 그
// 화면에서 따로 고정한다) 여기선 더 안 본다. "카테고리별 예산" 카드는 "카테고리별 체크리스트
// 진행률 · 시세비교"(2026-08-27, "시세비교"만 남아 체크리스트 진행률 카드라는 게 제목만 봐선
// 안 드러나던 문제 수정)로 바뀌어 `getCategories()`(has_benchmark 판정)와
// `getBenchmarkCompare()`도 목으로 배선해야 한다.
//
// **삭제한 테스트**: "비용이 없는 카테고리는 진행률 바를 그리지 않는다"(구 sample-data의
// `budget: null` 분기) — 체크리스트 진행률은 예산 유무와 무관하게 항상 뜨므로 더 이상 해당하는
// 개념이 아니다(CategoryRow.tsx 머리말).
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { BenchmarkComparison } from "@/entities/payment";
import type { CategoriesResponse } from "@/entities/wedding";
import type { DashboardSummary } from "@/entities/dashboard";
import { DashboardPage } from "./DashboardPage";

vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  Link: ({ to, params, children, ...rest }: { to: string; params?: { id?: string }; children?: ReactNode }) => (
    <a href={params?.id === undefined ? to : to.replace("$id", params.id)} {...rest}>
      {children}
    </a>
  ),
}));

const getDashboardSummaryMock = vi.fn();
vi.mock("@/entities/dashboard", async (orig) => ({
  ...(await orig<typeof import("@/entities/dashboard")>()),
  getDashboardSummary: () => getDashboardSummaryMock(),
}));

const getCategoriesMock = vi.fn();
vi.mock("@/entities/wedding", async (orig) => ({
  ...(await orig<typeof import("@/entities/wedding")>()),
  getCategories: () => getCategoriesMock(),
}));

const getBenchmarkCompareMock = vi.fn();
// 이전엔 getUpcomingPayments()가 목킹 안 돼 있어 "다가오는 결제" 카드가 이 파일의 테스트에서
// 실제로 한 번도 렌더된 적이 없었다(네트워크 실패 → 조용히 null) — 2026-08-27에 메움.
const getUpcomingPaymentsMock = vi.fn();
vi.mock("@/entities/payment", async (orig) => ({
  ...(await orig<typeof import("@/entities/payment")>()),
  getBenchmarkCompare: (params: unknown) => getBenchmarkCompareMock(params),
  getUpcomingPayments: (days: number) => getUpcomingPaymentsMock(days),
}));

const SUMMARY: DashboardSummary = {
  wedding_date: "2027-03-06",
  d_day: 198,
  total_budget: 45_000_000,
  total_paid: 3_800_000,
  total_planned: 40_200_000,
  remaining_budget: 1_000_000,
  categories: [
    { category_code: "MEETING", name_ko: "상견례", tier: "MOCKUP", is_active: true, planned_budget: 0, paid_amount: 0, progress_rate: 0.6 },
    {
      category_code: "VENUE",
      name_ko: "예식장",
      tier: "FOCUS",
      is_active: true,
      planned_budget: 12_000_000,
      paid_amount: 3_000_000,
      progress_rate: 0.4,
    },
  ],
  upcoming_items: [
    { source: "timeline", id: "t1", category_code: "VENUE", title: "예식장 중도금 납부", target_date: "2026-09-01", d_day: 12 },
    { source: "checklist", id: "c1", category_code: "VENUE", title: "예식장 계약서 검토", status: "DOING" },
  ],
  // 이 화면은 budget_benchmark를 더 이상 안 읽는다(UX 개편 3차, BudgetDonut.test.tsx로 이전) —
  // DashboardSummary 타입 자체는 여전히 이 필드를 요구하므로 픽스처에는 남겨 둔다.
  budget_benchmark: null,
};

// has_benchmark은 VENUE만 true — 실제 배포 상태(backend/app/core/categories.py)와 같은 모양.
// MEETING은 planned_budget=0이기도 해서, "0원은 애초에 비교 호출을 안 한다" 분기와 겹치지 않게
// has_benchmark 자체를 false로 둬 두 조건을 분리해서 검증한다.
const CATEGORIES_RESPONSE: CategoriesResponse = {
  categories: [
    { code: "MEETING", name_ko: "상견례", display_order: 1, tier: "MOCKUP", has_cost: true, has_benchmark: false, has_vendor_cases: false, allows_custom_tag: false },
    { code: "VENUE", name_ko: "예식장", display_order: 2, tier: "FOCUS", has_cost: true, has_benchmark: true, has_vendor_cases: true, allows_custom_tag: false },
  ],
};

const VENUE_BENCHMARK: BenchmarkComparison = {
  category_code: "VENUE",
  item_code: "TOTAL",
  region_code: "SEOUL_OTHER",
  survey_month: "2026-07",
  your_amount: 12_000_000,
  median_price: 11_000_000,
  min_price: 8_000_000,
  max_price: 15_000_000,
  sample_count: 42,
  percentile_label: "평균",
  ratio_to_median: 1.09,
  source_url: "https://example.com",
  source_note: null,
};

beforeEach(() => {
  getDashboardSummaryMock.mockReset();
  getDashboardSummaryMock.mockResolvedValue(SUMMARY);
  getCategoriesMock.mockReset();
  getCategoriesMock.mockResolvedValue(CATEGORIES_RESPONSE);
  getBenchmarkCompareMock.mockReset();
  getBenchmarkCompareMock.mockResolvedValue(VENUE_BENCHMARK);
  getUpcomingPaymentsMock.mockReset();
  getUpcomingPaymentsMock.mockResolvedValue({
    days: 30,
    // d_day를 "다가오는 할 일" 카드의 timeline 항목(d_day: 12)과 겹치지 않게 둔다 — 겹치면
    // 두 카드 모두 "D-12" 텍스트를 그려 getByText("D-12")가 복수 매치로 깨진다.
    payments: [{ id: "u1", category_code: "VENUE", item_name: "예식장 중도금", amount: 4_200_000, due_date: "2026-09-01", d_day: 25 }],
  });
});

async function renderDashboard() {
  const view = render(<DashboardPage />);
  // 실 fetch(mock)를 기다려야 한다 — 첫 렌더는 "불러오는 중…"이다. 도넛이 없어진 뒤로는
  // "다가오는 할 일"이 항상 첫 카드다(시세비교 조회가 늦게 끝나도 이 카드는 즉시 뜬다).
  await screen.findByRole("heading", { level: 2, name: "다가오는 할 일" });
  return view;
}

describe("카드 구조", () => {
  // getUpcomingPayments()가 이제 목킹돼 있어(2026-08-27) "다가오는 결제" 카드도 실제로 렌더된다
  // — 이전엔 이 카드가 이 테스트 파일에서 한 번도 렌더된 적이 없었다(조용한 네트워크 실패).
  it("카드 3개가 각각 레벨 2 제목을 갖는다 — 예산 도넛은 예산 페이지로 옮겼다", async () => {
    await renderDashboard();
    // "다가오는 결제" 카드는 별도 useEffect(getUpcomingPayments)로 늦게 뜬다 — 렌더 직후엔
    // 아직 없을 수 있어 명시적으로 기다린다.
    await screen.findByRole("heading", { level: 2, name: "다가오는 결제 · 30일 이내" });

    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(["다가오는 할 일", "다가오는 결제 · 30일 이내", "카테고리별 체크리스트 진행률 · 시세비교"]);
  });
});

describe("다가오는 할 일 — 금액 없이 D-Day/상태만 보여준다", () => {
  it("timeline 항목은 D-Day 배지를, checklist 항목은 상태 배지를 갖는다", async () => {
    await renderDashboard();

    expect(screen.getByText("D-12")).toBeInTheDocument();
    expect(screen.getByText("예식장 중도금 납부")).toBeInTheDocument();
    expect(screen.getByText("진행 중")).toBeInTheDocument();
    expect(screen.getByText("예식장 계약서 검토")).toBeInTheDocument();
  });
});

describe("카테고리별 체크리스트 진행률 · 시세비교", () => {
  it("진행률 바마다 어느 카테고리인지 말한다 — 접근명이 서로 다르고, 예산 지불률이 아니라 체크리스트 진행률이다", async () => {
    await renderDashboard();

    const names = screen.getAllByRole("progressbar").map((bar) => bar.getAttribute("aria-label"));

    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("예식장 체크리스트 진행률");
  });

  it("카테고리 행이 상세 화면(/category/$id)으로 가는 링크다 — URL은 소문자다", async () => {
    await renderDashboard();

    const link = screen.getByRole("link", { name: /예식장/u });
    expect(link).toHaveAttribute("href", "/category/venue");
  });

  it("체크리스트 진행률을 비율(%)로 보여준다 — 개수(3/5)가 아니다", async () => {
    await renderDashboard();

    // 예식장 progress_rate: 0.4 → "체크리스트 40%"
    expect(screen.getByText("체크리스트 40%")).toBeInTheDocument();
  });

  it("has_benchmark 카테고리는 시세비교 결과가 뜨면 중앙값·배율을 함께 보여준다", async () => {
    await renderDashboard();

    await waitFor(() => {
      expect(getBenchmarkCompareMock).toHaveBeenCalledWith({ categoryCode: "VENUE", itemCode: "TOTAL", amount: 12_000_000 });
    });
    expect(await screen.findByText("11,000,000원")).toBeInTheDocument();
    expect(screen.getByText("1.09배")).toBeInTheDocument();
    expect(screen.getByText(/시세 대비 평균/u)).toBeInTheDocument();
  });

  it("has_benchmark이 아닌 카테고리는 시세비교를 아예 호출하지 않고 문구도 안 낸다", async () => {
    await renderDashboard();
    await waitFor(() => expect(getCategoriesMock).toHaveBeenCalled());

    expect(getBenchmarkCompareMock).not.toHaveBeenCalledWith(expect.objectContaining({ categoryCode: "MEETING" }));
  });

  it("시세비교 조회가 실패해도(404 등) 카드 전체가 죽지 않고 체크리스트는 그대로 보인다", async () => {
    getBenchmarkCompareMock.mockRejectedValue(new Error("BENCHMARK_NOT_AVAILABLE"));
    await renderDashboard();

    await waitFor(() => expect(getBenchmarkCompareMock).toHaveBeenCalled());
    expect(screen.getByText("체크리스트 40%")).toBeInTheDocument();
    expect(screen.queryByText(/시세 대비/u)).not.toBeInTheDocument();
  });

  it("예산이 배정되지 않은(0원) 카테고리는 시세비교 호출 자체를 하지 않는다", async () => {
    getDashboardSummaryMock.mockResolvedValue({
      ...SUMMARY,
      categories: [{ category_code: "VENUE", name_ko: "예식장", tier: "FOCUS", is_active: true, planned_budget: 0, paid_amount: 0, progress_rate: 0 }],
    });
    await renderDashboard();
    await waitFor(() => expect(getCategoriesMock).toHaveBeenCalled());

    expect(getBenchmarkCompareMock).not.toHaveBeenCalled();
    expect(await screen.findByText("예산을 배정하면 시세와 비교할 수 있어요.")).toBeInTheDocument();
  });
});

// "예산 시세 비교 카드 — GET /dashboard/summary의 budget_benchmark" describe 블록은 여기 있었다.
// UX 개편 3차(2026-08-26)로 그 카드가 예산 페이지 "총 예산 현황" 카드로 옮겨가면서
// `BudgetDonut.test.tsx`로 이전됐다 — 이 화면은 더 이상 budget_benchmark를 그리지 않는다.

describe("셸과 화면의 경계", () => {
  it("브랜드를 화면이 그리지 않는다 — 셸 소관이다", async () => {
    await renderDashboard();

    expect(screen.queryByText("메리맵")).not.toBeInTheDocument();
  });
});
