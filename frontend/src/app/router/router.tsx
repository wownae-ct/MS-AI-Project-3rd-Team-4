// 라우트 트리 — ADR 0005.
//
// ## 코드 기반 라우팅이다 (ADR 0005 §결정 2)
//
// 파일 기반 라우팅은 `routeTree.gen.ts` 를 생성한다. ADR 0003 이 Panda CSS 를 기각한 사유가 정확히
// 이것이다 — 생성 디렉터리가 `.gitignore`·`ignorePatterns`·`noUnusedLocals` 와 3중으로 마찰한다.
// `createRootRoute`/`createRoute`/`createRouter` 는 플러그인 없이 동작하고 **타입 안전은 그대로 유지된다**.
//
// ## 트리 모양이 곧 셸 계약이다
//
//   root                       스킵 링크 · 배경 · 최소 높이   ← 모든 화면
//    ├── _shell (AppShell)     탭바/사이드바                  ← 크롬이 붙는 화면
//    │     ├── /                     S2 대시보드
//    │     ├── /category/$id         S3 카테고리 상세 (홈 탭에 귀속)
//    │     ├── /timeline             S4
//    │     ├── /budget               S6
//    │     ├── /report               S5
//    │     └── /style-guide          디자인 시스템 참조 화면
//    └── /onboarding            **셸 밖** — layout.md §1 "온보딩은 크롬이 없다"
//
// 온보딩을 `AppShell` 안에서 `if` 로 걸러내지 않는다. 구조로 표현해야 화면이 늘어도 규칙이 흩어지지 않는다.
// `_shell` 은 **경로 없는 레이아웃 라우트**다 — URL 에 아무 조각도 더하지 않고 레이아웃만 씌운다.
// (`createRoute` 는 `path` 와 `id` 중 하나가 필수이고, 경로 없는 라우트는 `id` 로 식별한다.)
//
// ## 스킵 링크가 `AppShell` 이 아니라 root 에 있는 이유
//
// layout.md §6 은 스킵 링크를 "AppShell" 소관으로 적었지만, 그대로 두면 **온보딩에서 스킵 링크가 사라진다**
// (온보딩은 셸 밖이다). 스킵 링크의 목적지는 `Page` 의 `<main id="page-content">` 이고 그건 온보딩에도 있다.
// 그래서 「셸 계층」 중 더 바깥인 root 에 둔다. §6 의 의도(= `Page` 에서 빼서 셸 계층으로 올린다)는 지켜진다.
//
// ## 코드 스플리팅은 이 결정의 **조건**이다 (ADR 0005 §결정 3)
//
// 라우터 코어 28.3 kB(gzip)를 그냥 얹으면 초기 JS 가 크게 늘고, 이 저장소의 실측상 **폰트 시작이 그만큼
// 밀린다**(폰트가 첫 방문 전송의 81% · LCP 경로 · JS 완료 19 ms 뒤에 요청된다). 그래서
// **첫 화면(`/`)만 정적 import** 하고 나머지는 전부 `lazyRouteComponent` 로 분리한다.
// 여기서 `import("@/pages/…")` 를 정적 import 로 바꾸면 그 화면이 조용히 초기 청크로 들어온다.
import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet } from "@tanstack/react-router";
import { DashboardPage } from "@/pages/dashboard";
import { PAGE_CONTENT_ID } from "@/shared/ui";
import { AppShell } from "../ui/AppShell";

// 보이지 않다가 포커스를 받으면 나타난다. `sr-only` 만 두면 키보드 사용자가 이 링크를 볼 수 없고,
// `focus:not-sr-only` 만 두면 항상 보인다 — 둘이 한 세트다.
const SKIP_LINK =
  "sr-only rounded-sm border border-line bg-surface px-4 py-2 text-sm font-bold text-ink " +
  "focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10";

function RootLayout() {
  return (
    <div className="min-h-dvh bg-bg">
      <a href={`#${PAGE_CONTENT_ID}`} className={SKIP_LINK}>
        본문으로 건너뛰기
      </a>
      <Outlet />
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_shell",
  component: AppShell,
});

// 첫 화면만 정적 import — 초기 청크에 남는 유일한 화면이다.
const dashboardRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/",
  component: DashboardPage,
});

// 경로 파라미터는 `$id` 다. layout.md §2 의 `/category/:id` 는 일반 표기이고
// TanStack 의 문법은 `$` 다 — 여기서 `:id` 로 쓰면 리터럴 경로가 되어 조용히 매칭되지 않는다.
const categoryRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/category/$id",
  component: lazyRouteComponent(() => import("@/pages/category"), "CategoryPage"),
});

const timelineRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/timeline",
  component: lazyRouteComponent(() => import("@/pages/timeline"), "TimelinePage"),
});

const budgetRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/budget",
  component: lazyRouteComponent(() => import("@/pages/budget"), "BudgetPage"),
});

const reportRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/report",
  component: lazyRouteComponent(() => import("@/pages/report"), "ReportPage"),
});

const styleGuideRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/style-guide",
  component: lazyRouteComponent(() => import("@/pages/style-guide"), "StyleGuidePage"),
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: lazyRouteComponent(() => import("@/pages/onboarding"), "OnboardingPage"),
});

/**
 * 트리를 공개하는 이유는 **테스트가 같은 트리를 메모리 히스토리로 다시 조립하기 위해서**다.
 * 테스트용 트리를 따로 만들면 검증 대상과 실제 배선이 갈려, 라우트를 잘못 고쳐도 테스트가 초록으로 남는다.
 */
export const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([
    dashboardRoute,
    categoryRoute,
    timelineRoute,
    budgetRoute,
    reportRoute,
    styleGuideRoute,
  ]),
  onboardingRoute,
]);

export const router = createRouter({ routeTree });

// 라우트 타입을 전역에 등록한다 — 이게 있어야 `<Link to="…">` 와 `params` 가 **컴파일 타임에** 검증된다.
// ADR 0005 가 28 kB 를 지불하고 산 것이 정확히 이 검사이므로, 이 선언이 사라지면 결정의 근거가 사라진다.
// R5(주입 시험)가 이 등록이 실제로 동작하는지 확인한다.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
