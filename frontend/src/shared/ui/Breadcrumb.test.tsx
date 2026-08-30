// 브레드크럼브 계약 (D25).
//
// 이 컴포넌트가 깨지는 두 방식은 **둘 다 화면에 아무 변화를 남기지 않는다** — 그래서 눈으로는 못
// 잡고 여기가 게이트다:
//   ① 조상 링크에서 `activeOptions={{ exact: true }}` 가 빠지면 `to="/"` 가 모든 경로에 걸려
//      조상이 조용히 「현재 위치」가 된다(TanStack Link 의 기본은 접두사 매칭이다)
//   ② `after:*` 의사요소가 빠지면 터치 타겟이 44px → 22px 로 조용히 줄어든다
//
// `Link` 는 라우터 컨텍스트가 있어야 렌더된다 — 메모리 히스토리로 최소 트리를 조립한다.
// 실제 앱 트리(`app/router`)를 쓰지 않는 것은 이 파일이 셸이 아니라 컴포넌트 하나를 보기 때문이고,
// 그 조립을 보는 것은 `app/ui/AppShell.test.tsx` 몫이다.
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { Breadcrumb } from "./Breadcrumb";

// ⚠️ `RouterProvider` 의 첫 렌더는 **비동기**다(초기 매칭이 끝나야 화면이 나온다) — 동기로 단언하면
// 빈 `<div>` 를 보게 된다. 그래서 헬퍼가 브레드크럼브를 `findBy` 로 기다렸다가 돌려준다.
async function renderAt(path: string) {
  const rootRoute = createRootRoute({
    component: () => <Breadcrumb ancestors={[{ label: "홈", to: "/" }]} current="예식장" />,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return screen.findByRole("navigation", { name: "현재 위치" });
}

describe("마크업 — ARIA APG Breadcrumb", () => {
  it("고유 라벨을 가진 nav 랜드마크로 낸다", async () => {
    expect(await renderAt("/category/venue")).toBeInTheDocument();
  });

  // APG 의 핵심 규칙이다 — 현재 화면은 링크가 아니고 `aria-current="page"` 를 진다.
  // 타입이 이미 강제하지만(ancestors / current 가 별개 prop) 렌더 결과로도 고정한다.
  it("현재 화면은 링크가 아니고 aria-current=page 를 진다", async () => {
    const nav = await renderAt("/category/venue");

    expect(within(nav).queryByRole("link", { name: "예식장" })).not.toBeInTheDocument();
    expect(within(nav).getByText("예식장")).toHaveAttribute("aria-current", "page");
  });

  it("조상은 링크이고 목적지가 홈이다", async () => {
    const nav = await renderAt("/category/venue");
    expect(within(nav).getByRole("link", { name: "홈" })).toHaveAttribute("href", "/");
  });
});

// 🚨 회귀 방지 — 이게 깨져도 화면은 똑같이 보인다.
describe("조상 링크의 exact 매칭", () => {
  it("현재 경로가 조상이 아니면 조상에 aria-current 가 붙지 않는다", async () => {
    const nav = await renderAt("/category/venue");
    expect(within(nav).getByRole("link", { name: "홈" })).not.toHaveAttribute("aria-current");
  });

  // 집합 안에 정확히 하나 — docs/design/layout.md §5. 브레드크럼브는 주 메뉴와 **다른 집합**이라
  // 각자 하나씩 갖는 것이 옳다(그 사실을 문서 전체 개수로 검사하던 축약은 D25 가 정정했다).
  it("이 집합 안의 aria-current 는 정확히 하나다", async () => {
    const nav = await renderAt("/category/venue");
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });
});

describe("터치 타겟 — 상자와 의사요소는 짝이다", () => {
  // `relative` 없이 `after:absolute` 만 있으면 의사요소가 **가장 가까운 위치 지정 조상**을 기준으로
  // 잡혀 히트 영역이 엉뚱한 곳에 생긴다. 둘을 함께 단언한다(`Button.test.tsx` 의 `sm` 계약과 같은 처리).
  it("조상 링크가 relative + after 세로 확장을 함께 갖는다", async () => {
    const nav = await renderAt("/category/venue");

    const link = within(nav).getByRole("link", { name: "홈" });
    expect(link).toHaveClass("relative");
    expect(link).toHaveClass("after:absolute");
    expect(link).toHaveClass("after:-inset-y-3");
  });
});
