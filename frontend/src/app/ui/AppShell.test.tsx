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

async function renderShellAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const view = render(<RouterProvider router={router} />);
  // 화면이 도착한 뒤에 단언한다 — lazy 라우트는 비동기다.
  await screen.findByRole("heading", { level: 1 });
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
