// 앱 셸 접근성 계약 (docs/design/layout.md §5 · ADR 0005 승인 조건 R6).
//
// layout.md §5 는 이 계약을 표로 적어 두었지만, **적어 둔 것만으로는 지켜지지 않는다** — 이 저장소가
// 반복해서 손해 본 패턴이 정확히 그것이라 색·라운드·그림자는 이미 빌드 게이트로 옮겼다.
// 내비게이션은 산출 CSS 로 검사할 수 있는 대상이 아니므로 **여기가 그 게이트**다.
//
// 셸은 라우터 컨텍스트 없이는 렌더되지 않는다(`Link`·`Outlet`). 그래서 실제 `routeTree` 를
// 메모리 히스토리로 조립한다 — 셸만 따로 떼어내 mock 으로 감싸면 계약이 아니라 mock 을 검증하게 된다.
//
// 실제 트리는 이제 `_authed`(세션)·`_shell`(웨딩) 가드를 지난다(App.test.tsx §가드).
// 여기서 검증하는 건 가드가 아니라 셸의 내비게이션 마크업이므로, 가드를 통과시키는
// 웨딩 있는 사용자로 loadSession 을 고정한다 — App.test.tsx 와 같은 패턴이다.
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "../router";

vi.mock("@/entities/session", async (orig) => ({
  ...(await orig<typeof import("@/entities/session")>()),
  loadSession: () =>
    Promise.resolve({ id: "u", email: "a@b.c", displayName: null, hasWedding: true }),
}));

// [2026-08-27] `/budget`(BudgetPage + CostManagementTab)이 마운트 즉시 실API 4종을 부른다 —
// App.test.tsx §22-29가 CategoryPage/OnboardingPage에 대해 이미 겪은 것과 같은 클래스의 결함
// (VITE_API_BASE=https://api.test 는 의도적으로 응답하지 않는 주소라 실제로 나가면 안 되는
// 네트워크 호출이다). 이 파일이 보는 건 라우팅 조립/셸 마크업이지 예산 데이터 렌더링이 아니므로
// (그건 BudgetPage.test.tsx 등 각 화면 계약 테스트의 몫이다), 값은 최소한만 채운다 — 빈
// 배열/0/null이면 BudgetPage가 에러 없이 그려지는 데 충분하다.
//
// **다만 "/budget 에서 정확히 하나다"가 실제로 깨졌던 원인은 이 네트워크 호출 자체가 아니었다**
// (교정: 처음엔 DNS 실패가 findBy* 기본 타임아웃을 넘긴 거라고 추정했으나, 아래 mock을 전부
// 넣은 뒤에도 여전히 간헐적으로 실패해 재조사함) — `/budget`은 `AllocationOverview`·
// `CostManagementTab`·`BudgetDonut`까지 딸린 무거운 lazy 청크라, 이 환경에서 import+렌더가
// 다른 라우트보다 오래 걸려 `findByRole`의 기본 대기시간(`@testing-library/dom` 1000ms)을
// 살짝 넘기는 경우가 있었다(타임아웃을 1100~1500ms로만 올려도 결정적으로 통과함을 확인 —
// 무한 대기가 아니라 딱 그만큼 느린 것). 그래서 실제 수정은 두 가지다: ① 아래 mock으로
// 진짜 네트워크 의존을 없애 결과를 결정적으로 만들고, ② `renderShellAt`의 대기시간을
// 넉넉히 올려 무거운 라우트도 안정적으로 잡히게 한다. mock만으로는 이 특정 실패의 재발을
// 막지 못했다 — 두 수정이 함께 있어야 한다.
vi.mock("@/entities/wedding", async (orig) => ({
  ...(await orig<typeof import("@/entities/wedding")>()),
  getMyWedding: () =>
    Promise.resolve({
      id: "w",
      created_at: "2026-01-01T00:00:00Z",
      wedding_date: null,
      wedding_date_precision: "UNDECIDED",
      total_budget: 0,
      region_code: "SEOUL",
      guest_count: null,
    }),
  getWeddingCategories: () => Promise.resolve({ categories: [] }),
  getCategories: () => Promise.resolve({ categories: [] }),
}));

vi.mock("@/entities/payment", async (orig) => ({
  ...(await orig<typeof import("@/entities/payment")>()),
  getUpcomingPayments: () => Promise.resolve({ days: 30, payments: [] }),
  // CostManagementTab.tsx가 마운트 즉시 부른다(BudgetPage 자신이 아니라 그 자식) — 위
  // getMyWedding/getWeddingCategories/getCategories만으로는 안 잡히는 4번째 호출.
  getPayments: () => Promise.resolve({ payments: [] }),
}));

vi.mock("@/entities/dashboard", async (orig) => ({
  ...(await orig<typeof import("@/entities/dashboard")>()),
  getDashboardSummary: () =>
    Promise.reject(new Error("AppShell.test.tsx는 budget_benchmark 렌더를 검증하지 않는다")),
}));

async function renderShellAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const view = render(<RouterProvider router={router} />);
  // 화면이 도착한 뒤에 단언한다 — lazy 라우트는 비동기다. 기본 1000ms로는 `/budget`처럼
  // 무거운 청크에서 간헐적으로 부족했다(위 mock 블록 코멘트 참고) — 5000ms는 실측(1100ms면
  // 이미 통과)보다 넉넉한 여유를 둔 값이다.
  await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });
  return view;
}

describe("내비게이션 마크업", () => {
  it("nav 랜드마크가 2개이고 각각 고유한 이름을 갖는다", async () => {
    await renderShellAt("/");

    const navigations = screen.getAllByRole("navigation");
    expect(navigations).toHaveLength(2);

    // APG: "If a page includes more than one navigation landmark, each should have a unique label."
    const labels = navigations.map((nav) => nav.getAttribute("aria-label"));
    expect(labels).toEqual(["주 메뉴", "보조 메뉴"]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  // 탭 위젯은 **같은 페이지 안 패널 전환**용이다. URL 이 바뀌는 라우트 내비게이션에 쓰면
  // 스크린리더 사용자에게 "패널이 바뀐다"고 잘못 알린다.
  it("role=tablist 를 쓰지 않는다 — 라우트 내비게이션은 탭 위젯이 아니다", async () => {
    await renderShellAt("/");
    expect(screen.queryAllByRole("tablist")).toHaveLength(0);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  // [2026-08-27, 정정] 처음엔 이 자리에 로그아웃 버튼 자체를 뒀었다(데스크톱 사이드바에만 있고
  // 모바일엔 없던 실제 갭). 곧이어 docs/wedding/refactor/bug-todo.md [결정됨]에 따라 로그아웃을
  // `pages/settings/ui/SettingsPage.tsx`로 옮기고 이 자리엔 그 화면으로 가는 설정(⚙️) 링크만
  // 남겼다 — 그래서 지금 고정하는 건 "로그아웃 버튼 2개"가 아니라 "설정 진입 링크 2개"다.
  // 둘 다 항상 같은 DOM에 있다(§"단일 DOM + CSS 재배치") — 2개인 것 자체가 계약이고, 1개면
  // 어느 한쪽이 없어진 회귀다.
  it("설정 진입 링크가 데스크톱 사이드바·모바일 상단 바 양쪽에 있다", async () => {
    await renderShellAt("/");
    expect(screen.getAllByRole("link", { name: "설정" })).toHaveLength(2);
  });

  // [2026-08-28] 브랜드가 layout.md §4 의 예약 슬롯에 들어왔다(D15). 셸이 소유한다는 사실 자체가
  // 계약이다 — DashboardPage.test.tsx·ReportPage.test.tsx 가 반대편에서 *"화면은 브랜드를 그리지
  // 않는다"* 를 고정하고 있어, 두 테스트가 한 쌍으로 "브랜드의 소재지는 셸 한 곳"을 지킨다.
  //
  // 2개인 것이 계약이다 — 데스크톱 사이드바 + 모바일 상단 바. 설정 진입 링크와 같은 구조이고
  // (위 테스트 참고) 실브라우저에서는 항상 한쪽이 `display:none` 이다.
  it("브랜드가 데스크톱 사이드바·모바일 상단 바 양쪽에 있다", async () => {
    await renderShellAt("/");
    // 워드마크는 이미지다(로고타입) — 접근명은 alt 로 온다. 화면들이 단언하는
    // `queryByText("메리맵")` 과 조회 경로가 다르므로 그쪽 계약과 충돌하지 않는다.
    expect(screen.getAllByRole("img", { name: "메리맵" })).toHaveLength(2);
  });

  // 🚨 회귀 방지 — 로고 클릭 → 홈은 웹 관례지만 여기서는 `<Link>` 로 만들면 안 된다.
  // TanStack 의 `Link` 는 활성일 때 `aria-current="page"` 를 붙이고 props 로 덮을 수 없어서
  // (AppShell.tsx 의 `MobileSettingsLink` 주석에 실측 근거), 대시보드에서 홈 항목과 함께 2개가 되어
  // 아래 "정확히 하나다" 계약이 깨진다. 바로 아래 홈 탭이 있으므로 잃는 경로가 없다.
  it("브랜드는 링크가 아니다 — aria-current 계약을 깨지 않기 위해서다", async () => {
    await renderShellAt("/");
    expect(screen.queryByRole("link", { name: /메리맵/u })).not.toBeInTheDocument();
  });

  // 브랜드는 `<nav>` 밖에 둔다 — 이 파일 첫 테스트("nav 랜드마크가 2개")와 아래 "주 메뉴는 5개다" 가
  // 그 배치를 이미 간접적으로 고정하지만, 링크가 아니라는 위 계약과 함께 읽히도록 여기 남긴다.
  // layout.md §3 의 4개(홈·타임라인·예산·리포트)에 2026-08-24 "AI상담"이 5번째로 추가됐다
  // (12_final_prototype_mockup.html의 탭바 — AppShell.tsx PRIMARY_NAV 머리말 참조).
  it("주 메뉴는 5개다 — 순서가 계약이다", async () => {
    await renderShellAt("/");

    const primary = screen.getByRole("navigation", { name: "주 메뉴" });
    const labels = within(primary)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(labels).toEqual(["홈", "타임라인", "예산", "리포트", "AI상담"]);
  });
});

describe("현재 위치 표시 — aria-current", () => {
  // `aria-current="page"` 는 **집합 안에 정확히 하나**여야 한다. 여러 개면 "지금 어디인가"가 무의미해진다.
  // 이게 깨지는 가장 흔한 경로는 접두사 매칭이다 — `to="/"` 에 exact 를 주지 않으면 모든 경로에 걸린다.
  // `it.each` 로 경로마다 독립 테스트를 만든다 — 한 테스트 안에서 루프를 돌면 첫 경로에서 깨졌을 때
  // 나머지가 실행되지 않아 "어디서부터 깨졌는지"를 잃는다(순차 렌더라 병렬화도 불가능하다).
  it.each(["/", "/timeline", "/budget", "/report", "/style-guide"])(
    "%s 에서 정확히 하나다",
    async (path) => {
      await renderShellAt(path);
      expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    },
  );

  it("현재 화면의 항목에 붙는다", async () => {
    await renderShellAt("/timeline");
    expect(screen.getByRole("link", { name: "타임라인" })).toHaveAttribute("aria-current", "page");
  });

  // layout.md §1: tabHome active = (screen === 'dashboard' || screen === 'category')
  // 카테고리 상세는 독립 탭이 아니라 홈에 귀속되는 하위 화면이다. 이 규칙이 탭바와 사이드바로
  // 흩어지면 활성 표시가 조용히 갈리므로 `NavItem` 한 곳에 모아 두었다.
  it("카테고리 상세에서도 홈이 활성이다 — 그리고 여전히 하나뿐이다", async () => {
    await renderShellAt("/category/wedding-hall");

    expect(screen.getByRole("link", { name: "홈" })).toHaveAttribute("aria-current", "page");
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });
});
