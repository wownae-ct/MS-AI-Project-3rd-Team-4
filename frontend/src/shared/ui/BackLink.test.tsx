// 「뒤로」 계약 (D25).
//
// 이 컴포넌트의 요점은 **분기 자체**다 — 갈 곳이 있으면 히스토리를 되감고, 없으면(북마크·새로고침·
// 주소 직접 입력) 홈으로 보낸다. 그 판정이 조용히 한쪽으로 굳으면 딥링크 진입 사용자가 탈출구를
// 잃거나(항상 back), 문맥을 잃는다(항상 홈으로).
//
// **`useCanGoBack` 을 목으로 바꾸지 않는다.** 설치본은 `location.state.__TSR_index !== 0` 을 보고,
// `createMemoryHistory` 는 `initialEntries` 의 각 항목에 그 인덱스를 실제로 심는다(설치본
// @tanstack/history 의 `assignKeyAndIndex` 확인). 즉 **진입 항목 개수만으로 두 갈래를 다 만들 수
// 있다** — 목으로 바꾸면 판정식이 바뀌어도 이 테스트는 초록으로 남는다.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { BackLink } from "./BackLink";

// 두 화면짜리 최소 트리 — `/settings` 에서 되감으면 `/` 로 간다.
function renderWithHistory(initialEntries: string[]) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <BackLink />
        <Outlet />
      </>
    ),
  });
  const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <p>홈 화면</p> });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: () => <p>설정 화면</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, settingsRoute]),
    history: createMemoryHistory({ initialEntries }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("갈 곳이 있을 때 — 히스토리 되감기", () => {
  it("「뒤로」 버튼을 내고, 누르면 직전 화면으로 돌아간다", async () => {
    const user = userEvent.setup();
    const router = renderWithHistory(["/", "/settings"]);

    await screen.findByText("설정 화면");
    const back = screen.getByRole("button", { name: "뒤로" });

    await user.click(back);

    await screen.findByText("홈 화면");
    expect(router.state.location.pathname).toBe("/");
  });

  // 목적지 URL 이 없는 동작이라 링크가 아니다 — `<a href>` 로 내면 새 탭으로 열리는 등
  // 링크의 계약(주소가 있다)을 지키지 못한다.
  it("링크가 아니라 버튼이다", async () => {
    renderWithHistory(["/", "/settings"]);
    await screen.findByText("설정 화면");

    expect(screen.queryByRole("link", { name: /뒤로|홈으로/u })).not.toBeInTheDocument();
  });
});

describe("갈 곳이 없을 때 — 딥링크·새로고침 진입", () => {
  // 🚨 이 갈래가 사라지면 북마크로 들어온 사용자는 **아무 일도 일어나지 않는 버튼**을 누르게 된다.
  it("「홈으로」 링크로 바뀐다 — 라벨이 실제 동작을 말한다", async () => {
    renderWithHistory(["/settings"]);
    await screen.findByText("설정 화면");

    expect(screen.getByRole("link", { name: "홈으로" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: /뒤로/u })).not.toBeInTheDocument();
  });

  // `activeOptions={{ exact: true }}` 회귀 방지 — 빼면 `to="/"` 가 접두사 매칭으로 `/settings` 에도
  // 걸려 「지금 홈에 있다」고 잘못 알린다. 화면에는 아무 변화가 없다.
  it("현재 화면이 홈이 아니면 aria-current 가 붙지 않는다", async () => {
    renderWithHistory(["/settings"]);
    await screen.findByText("설정 화면");

    expect(screen.getByRole("link", { name: "홈으로" })).not.toHaveAttribute("aria-current");
  });
});

describe("터치 타겟 — 상자와 의사요소는 짝이다", () => {
  // `Breadcrumb` 의 같은 계약과 짝이다 — 두 컴포넌트가 `Page` 의 같은 슬롯을 쓰므로 규격이 갈리면
  // 화면을 옮길 때마다 제목 위 줄이 들썩인다(`page-nav-style.ts` 가 그 단일 출처다).
  it("두 갈래 모두 relative + after 세로 확장을 갖는다", async () => {
    renderWithHistory(["/", "/settings"]);
    await screen.findByText("설정 화면");
    const button = screen.getByRole("button", { name: "뒤로" });
    expect(button).toHaveClass("relative");
    expect(button).toHaveClass("after:absolute");
    expect(button).toHaveClass("after:-inset-y-3");
  });
});
