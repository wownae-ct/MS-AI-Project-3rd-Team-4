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
// **삭제한 테스트**: "비용이 없는 카테고리는 진행률 바를 그리지 않는다"(구 sample-data의
// `budget: null` 분기). `GET /dashboard/summary` 실 응답은 활성 카테고리의 `planned_budget`을
// 항상 숫자로 준다(adapt-summary.ts 머리말 — "돈이 안 드는 카테고리" 개념이 백엔드에 없다) —
// 그 분기는 `CategoryRow.tsx`에 코드로는 남아 있지만 이 페이지를 통해서는 도달할 수 없어
// 실 데이터로 재현할 수 없는 테스트를 남기지 않는다.
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
};

beforeEach(() => {
  getDashboardSummaryMock.mockReset();
  getDashboardSummaryMock.mockResolvedValue(SUMMARY);
});

async function renderDashboard() {
  const view = render(<DashboardPage />);
  // 실 fetch(mock)를 기다려야 한다 — 첫 렌더는 "불러오는 중…"이다.
  await screen.findByRole("heading", { level: 2, name: "예산 현황" });
  return view;
}

describe("카드 구조", () => {
  it("카드 3개가 각각 레벨 2 제목을 갖는다", async () => {
    await renderDashboard();

    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(["예산 현황", "다가오는 할 일", "카테고리별 예산"]);
  });
});

describe("예산 도넛 — 색만으로 전달하지 않는다", () => {
  it("3계열이 라벨 텍스트로도 제공된다", async () => {
    await renderDashboard();

    expect(screen.getByText("집행")).toBeInTheDocument();
    expect(screen.getByText("계획(미지급)")).toBeInTheDocument();
    expect(screen.getByText("미배정")).toBeInTheDocument();
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

describe("카테고리별 예산", () => {
  it("진행률 바마다 어느 카테고리인지 말한다 — 접근명이 서로 다르다", async () => {
    await renderDashboard();

    const names = screen.getAllByRole("progressbar").map((bar) => bar.getAttribute("aria-label"));

    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("예식장 예산 집행률");
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
});

describe("셸과 화면의 경계", () => {
  it("브랜드를 화면이 그리지 않는다 — 셸 소관이다", async () => {
    await renderDashboard();

    expect(screen.queryByText("메리맵")).not.toBeInTheDocument();
  });
});
