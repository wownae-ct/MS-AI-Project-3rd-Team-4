// S5 리포트 계약 (시각 스펙: docs/mockups/s5-report.html).
//
// **무엇을 테스트하고 무엇을 테스트하지 않는가**
// 색·라운드·그림자는 빌드 게이트(산출 CSS 파서)가, 유령 유틸리티는 ghost-candidates 가 이미
// 강제한다 — 여기서 클래스를 단언하지 않는다. 여기서 고정하는 것은 **그 게이트들이 볼 수 없는 것**뿐이다:
// 문서 구조(제목 레벨) · 접근명 · 화면이 주장하는 순서 · 데이터 사이의 정합성 · 셸과의 소유 경계 ·
// 실API 데이터 배선.
//
// 실API 연동(§5 인계 문서) 이후 `getMyReport()`/`getWeddingCategories()`를 목으로 대체한다
// (Promise.all — 둘 다 응답해야 화면이 렌더된다).
//
// **삭제한 테스트**: "모든 추천 항목이 실제 카테고리를 가리킨다"/"화면에 카테고리 id 가 새어
// 나오지 않는다" — 구 sample-data(`RECOMMENDED_CHECKS`의 `categoryId` ↔ `CATEGORY_BUDGETS`의
// `id`) 정합성 검사였다. 실API의 `next_recommended_checks`는 `category_code`로 참조하고
// `RecoRow`는 애초에 그 코드를 화면에 렌더하지 않으므로(해석된 이름만 보여준다) 같은 위험이 없다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MyReport } from "@/entities/dashboard";
import type { WeddingCategoriesResponse } from "@/entities/wedding";
import { ReportPage } from "./ReportPage";

const getMyReportMock = vi.fn();
vi.mock("@/entities/dashboard", async (orig) => ({
  ...(await orig<typeof import("@/entities/dashboard")>()),
  getMyReport: () => getMyReportMock(),
}));

const getWeddingCategoriesMock = vi.fn();
vi.mock("@/entities/wedding", async (orig) => ({
  ...(await orig<typeof import("@/entities/wedding")>()),
  getWeddingCategories: () => getWeddingCategoriesMock(),
}));

const REPORT: MyReport = {
  budget_summary: { total_budget: 45_000_000, total_paid: 3_800_000, remaining_budget: 1_000_000 },
  category_completion: [
    { category_code: "MEETING", progress_rate: 0.6 },
    { category_code: "VENUE", progress_rate: 0.4 },
  ],
  upcoming_payments: [
    { id: "p1", category_code: "VENUE", item_name: "예식장 중도금", amount: 4_200_000, due_date: "2026-09-01", d_day: 12 },
  ],
  next_recommended_checks: [
    { checklist_item_id: "ci1", category_code: "VENUE", title: "최소 보증 인원 조항 확인", priority: "high" },
  ],
};

const WEDDING_CATEGORIES: WeddingCategoriesResponse = {
  categories: [
    {
      category_code: "MEETING",
      name_ko: "상견례",
      tier: "MOCKUP",
      is_active: true,
      planned_budget: 0,
      paid_amount: 0,
      remaining: 0,
      selected_options: null,
      display_order: 1,
      has_benchmark: false,
      has_vendor_cases: false,
    },
    {
      category_code: "VENUE",
      name_ko: "예식장",
      tier: "FOCUS",
      is_active: true,
      planned_budget: 12_000_000,
      paid_amount: 3_000_000,
      remaining: 9_000_000,
      selected_options: null,
      display_order: 2,
      has_benchmark: true,
      has_vendor_cases: true,
    },
  ],
};

beforeEach(() => {
  getMyReportMock.mockReset();
  getWeddingCategoriesMock.mockReset();
  getMyReportMock.mockResolvedValue(REPORT);
  getWeddingCategoriesMock.mockResolvedValue(WEDDING_CATEGORIES);
});

async function renderReport() {
  const view = render(<ReportPage />);
  await screen.findByRole("heading", { level: 2, name: "예산" });
  return view;
}

describe("카드 구조", () => {
  // "다가오는 납부" 카드는 홈 탭(S2)의 UpcomingPaymentsCard와 중복이라 제거됐다(2026-08-27,
  // 사용자 지시) — 3개로 줄었다.
  it("카드 3개가 각각 레벨 2 제목을 갖는다", async () => {
    await renderReport();

    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(["예산", "카테고리별 진행률", "다음에 확인하면 좋아요"]);
  });

  it("추천 카드의 부제는 제목이 아니다", async () => {
    await renderReport();

    expect(screen.getByText("우선순위가 높은 순으로 최대 5개예요").tagName).toBe("P");
  });
});

describe("카테고리별 진행률", () => {
  it("바마다 어느 카테고리인지 말한다 — 접근명이 서로 다르다", async () => {
    await renderReport();

    const names = screen.getAllByRole("progressbar").map((bar) => bar.getAttribute("aria-label"));

    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(names.length);
  });

  // S2 와 뜻이 다르다는 것을 고정한다 — 여기 기준은 체크리스트 진행률이라 예산이 없는(0원)
  // 상견례도 바를 갖는다.
  it("예산이 없는 카테고리도 바를 갖는다 — 여기 기준은 체크리스트다", async () => {
    await renderReport();

    expect(screen.getByText("상견례")).toBeInTheDocument();
    const names = screen.getAllByRole("progressbar").map((bar) => bar.getAttribute("aria-label"));
    expect(names).toContain("상견례 준비 진행률");
  });

  it("진행률이 높은 순으로 나열한다", async () => {
    await renderReport();

    const percents = screen.getAllByText(/^\d+%$/u).map((el) => Number(el.textContent?.replace("%", "")));

    expect(percents).toEqual([...percents].toSorted((a, b) => b - a));
    expect(percents[0]).toBe(60);
  });
});

describe("다음에 확인하면 좋아요", () => {
  it("우선순위를 색이 아니라 텍스트로 전달한다", async () => {
    await renderReport();

    expect(screen.getByText("최소 보증 인원 조항 확인")).toBeInTheDocument();
    expect(screen.getByText("우선순위 높음")).toBeInTheDocument();
  });
});

describe("셸과 화면의 경계", () => {
  it("브랜드를 화면이 그리지 않는다 — 셸 소관이다", async () => {
    await renderReport();

    expect(screen.queryByText("메리맵")).not.toBeInTheDocument();
  });
});
