// 라우트 트리 — ADR 0005.
//
// ## 코드 기반 라우팅이다 (ADR 0005 §결정 2)
//
// 파일 기반 라우팅은 `routeTree.gen.ts` 를 생성한다. ADR 0003 이 Panda CSS 를 기각한 사유가 정확히
// 이것이다 — 생성 디렉터리가 `.gitignore`·`ignorePatterns`·`noUnusedLocals` 와 3중으로 마찰한다.
// `createRootRoute`/`createRoute`/`createRouter` 는 플러그인 없이 동작하고 **타입 안전은 그대로 유지된다**.
//
// ## 트리 모양이 곧 셸 계약 + 인증 가드다
//
//   root                       스킵 링크 · 배경 · 최소 높이   ← 모든 화면
//    ├── /login                **가드 없음** — signup 이 201 과 함께 쿠키를 발급하므로
//    │                          세션 가드를 두면 가입 직후 로그인 폼에 도달할 수 없다
//    └── _authed                세션 판정만 (없으면 /login)
//          ├── /onboarding      **셸 밖** — 웨딩 있으면 / 로 되돌림(무한 리다이렉트 방지)
//          └── _shell (AppShell) 웨딩 판정만 (없으면 /onboarding) ← 탭바/사이드바
//                ├── /                     S2 대시보드
//                ├── /category/$id         S3 카테고리 상세 (홈 탭에 귀속)
//                ├── /timeline             S4
//                ├── /budget               S6
//                ├── /report               S5
//                ├── /chat                 AI상담(카테고리 선택 → 상담) — 12_final_prototype_mockup.html
//                └── /style-guide          디자인 시스템 참조 화면
//
// **판정을 두 층으로 나누는 이유** — 한 층에서 「세션 없으면 /login, 웨딩 없으면 /onboarding」을
// 함께 처리하면 /onboarding 자신이 그 가드 아래 있으므로 무한 리다이렉트가 된다.
// `_authed` 는 세션만, `_shell` 은 웨딩만 본다.
//
// 온보딩을 `AppShell` 안에서 `if` 로 걸러내지 않는다. 구조로 표현해야 화면이 늘어도 규칙이 흩어지지 않는다.
// `_authed`·`_shell` 은 **경로 없는 레이아웃 라우트**다 — URL 에 아무 조각도 더하지 않고 판정/레이아웃만 씌운다.
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
//
// ⚠️ **예외 1건 — `/login` 도 정적 import 다** (Task 8). 원칙대로라면 첫 화면이 아니니 lazy 여야
// 하지만, 실측이 원칙을 뒤집었다: `lazyRouteComponent` 로 내려 봤더니 `/report` 와 공유하는 `Page`
// 컴포넌트를 Rollup 이 별도 청크로 뽑아냈고, 그 청크가 `dist/index.html` 에 `modulepreload` 로
// 걸려 **여전히 초기 로드 경로에 남았다** — 지연되는 바이트 없이 청크 분할 오버헤드만 더해져 JS
// 합계가 113,695 B → 115,029 B 로 더 나빠졌다. 그래서 `/login` 은 정적 import 로 남긴다
// (아래 `loginRoute` 정의 옆 주석에 실측 전체가 있다). **다음 화면(S1 등)을 lazy/정적으로 가를 때
// 이 문단만 보고 판단하지 말 것** — `/login` 은 "첫 화면"이 아닌데도 정적인, 이 원칙의 유일한 예외다.
import {
  createRootRoute,
  createRoute,
  createRouter,
  isRedirect,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { loadSession } from "@/entities/session";
import { DashboardPage } from "@/pages/dashboard";
import { LoginPage } from "@/pages/login";
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

// `/login?redirect=` 는 **밖에서 들어오는 값**이다(authedRoute.beforeLoad 가 스스로 채우는 값과
// 달리, 공격자가 링크에 심어 사용자를 유도할 수 있다). `/login` 은 요구 플로우상 가드가 없으므로
// (바로 아래 loginRoute 주석 참조) 이 경계에서 걸러내지 않으면 다음에 이 값을 소비하는 코드가
// (예: 로그인 성공 후 `navigate({ to: search.redirect })`) 그대로 열린 리다이렉트가 된다.
//
// 앱 내부의 절대 경로(슬래시로 시작)만 허용한다 — 아래 세 형태는 전부 외부로 나가므로 막는다.
//   · 스킴이 있는 절대 URL       "https://evil.example"        → 애초에 "/"로 시작하지 않는다
//   · 프로토콜 상대 URL          "//evil.example"               → WHATWG URL 이 현재 스킴을 그대로 쓴다
//   · 백슬래시로 시작/이어지는 값 "\evil.example" · "/\evil.example" → 일부 브라우저가 "\"를 "/"처럼
//     파싱해(WHATWG URL: 이른바 "special scheme"에서 backslash 를 slash 로 치환) 위 두 형태로 둔갑한다
// 조건을 만족하지 않으면 에러를 던지지 않고 `undefined` 로 떨어뜨린다 — 리다이렉트 매개변수 하나
// 때문에 로그인 화면 자체가 죽을 이유는 없다("그냥 로그인 후 홈으로" 로 대체되는 것으로 충분하다).
function sanitizeRedirectTarget(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return /^\/(?!\/|\\)/u.test(value) ? value : undefined;
}

// 로그인 화면은 셸 밖이고 **세션 가드가 없다** — signup 이 201 과 함께 쿠키를 발급하므로
// 가드를 두면 가입 직후 로그인 폼에 도달할 수 없다(요구 플로우 ③).
//
// ⚠️ 정적 import 다. `lazyRouteComponent` 로 내리면 `LoginPage`(Card·Button·Page + 폼)가 `report`
// 와 공유하는 `Page` 컴포넌트가 Rollup 에 의해 **별도 청크로 추출되고, 그 청크가
// `dist/index.html` 에 `modulepreload` 로 걸려 실질적으로 초기 로드 경로에 그대로 남는다**
// (실측: lazy 로 내리면 최대 단일 청크는 91,978 B로 줄지만 JS 합계는 오히려 115,029 B 로
// **더 나빠진다** — 청크 분리 오버헤드만 추가되고 실제로 지연되는 바이트가 없다).
// 정적 import 의 최대 단일 청크는 95,930 B 로 96,000 B 예산을 통과한다(§ 태스크 8 보고서 — 번들 참고).
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
  // `redirect` 는 _authed 의 beforeLoad 가 원래 가려던 위치를 실어 보내는 자리다 — 스키마에
  // 없으면 그 리다이렉트 호출이 타입 에러가 된다(_authed 와 이 라우트는 같은 search 계약을 진다).
  // 값은 여기서 바로 신뢰하지 않는다 — `sanitizeRedirectTarget` 이 앱 내부 경로인지 걸러낸다.
  validateSearch: (search: Record<string, unknown>) => ({
    oauth_error: typeof search.oauth_error === "string" ? search.oauth_error : undefined,
    redirect: sanitizeRedirectTarget(typeof search.redirect === "string" ? search.redirect : undefined),
  }),
});

// ## 판정을 두 층으로 나눈다
//
// 한 층에서 「세션 없으면 /login, 웨딩 없으면 /onboarding」을 함께 처리하면 /onboarding 자신이
// 그 가드 아래 있으므로 **무한 리다이렉트**가 된다. 그래서 _authed 는 세션만, _shell 은 웨딩만 본다.
const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authed",
  beforeLoad: async ({ location }) => {
    try {
      // 🚨 getMe() 를 직접 부르지 않는다. beforeLoad 는 캐시되지 않아서
      //    (공식: "A subsequent navigation ... reruns beforeLoad") 탭 이동마다 왕복이 붙는다.
      return { user: await loadSession() };
    } catch (cause) {
      // 의도적 리다이렉트를 여기서 삼키면 다시 리다이렉트가 걸려 루프가 된다.
      if (isRedirect(cause)) throw cause;
      // 401 도 네트워크 실패도 결과는 같다 — 로그인 화면으로 보낸다. 흰 화면으로 두지 않는다.
      // `oauth_error` 를 명시로 함께 준다 — validateSearch 의 반환 타입에 두 키가 다 있어서다.
      throw redirect({ to: "/login", search: { redirect: location.href, oauth_error: undefined } });
    }
  },
});

const onboardingRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/onboarding",
  beforeLoad: ({ context }) => {
    // 이미 온보딩을 마친 사용자를 다시 보내면 POST /weddings 가 409 로 막힌다.
    if (context.user.hasWedding) throw redirect({ to: "/" });
  },
  component: lazyRouteComponent(() => import("@/pages/onboarding"), "OnboardingPage"),
});

const shellRoute = createRoute({
  getParentRoute: () => authedRoute,
  id: "_shell",
  beforeLoad: ({ context }) => {
    if (!context.user.hasWedding) throw redirect({ to: "/onboarding" });
  },
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
//
// CategoryPage 는 `categoryCode` 를 prop 으로 받아야 라우터를 몰라도 된다(로그인/온보딩과 같은
// 원칙). `lazyRouteComponent` 는 route params 를 컴포넌트에 자동 주입하지 않으므로(자기 자신이
// `useParams` 를 불러야 한다) 여기서만 React.lazy + Suspense 로 감싸 `$id` 를 읽어 prop 으로 내린다
// — 코드 스플리팅 자체는 유지된다(청크는 그대로 분리).
const LazyCategoryPage = lazy(() => import("@/pages/category").then((mod) => ({ default: mod.CategoryPage })));

function CategoryRouteComponent() {
  const { id } = categoryRoute.useParams();
  // 2026-08-26 사용자 피드백: URL은 소문자(CategoryRow.tsx가 `id.toLowerCase()`로 링크를 만든다),
  // 그러나 `categoryCode`는 백엔드 계약값(VENUE 등, UPPER_SNAKE_CASE) 그대로여야 한다 — CategoryPage
  // 아래 모든 API 호출·`categories?.find((c) => c.code === categoryCode)` 비교가 이 값을 원본
  // 그대로 기대한다. 여기서 한 번만 되돌리면 하위 트리는 URL 대소문자를 아예 모른다.
  return (
    <Suspense fallback={null}>
      <LazyCategoryPage categoryCode={id.toUpperCase()} />
    </Suspense>
  );
}

const categoryRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/category/$id",
  component: CategoryRouteComponent,
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

// 5번째 탭 "AI상담" — AppShell.tsx PRIMARY_NAV 머리말 참조(2026-08-24 추가 근거,
// 12_final_prototype_mockup.html의 탭바). ChatPage는 라우터를 모르는 다른 화면들과 달리 콜백
// prop이 필요 없다(내부에서 카테고리 선택 상태만 로컬로 다루고 페이지 이동을 하지 않는다) —
// 그래서 다른 탭들과 똑같이 lazyRouteComponent를 그대로 쓸 수 있다.
const chatRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/chat",
  component: lazyRouteComponent(() => import("@/pages/chat"), "ChatPage"),
});

const styleGuideRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/style-guide",
  component: lazyRouteComponent(() => import("@/pages/style-guide"), "StyleGuidePage"),
});

/**
 * 트리를 공개하는 이유는 **테스트가 같은 트리를 메모리 히스토리로 다시 조립하기 위해서**다.
 * 테스트용 트리를 따로 만들면 검증 대상과 실제 배선이 갈려, 라우트를 잘못 고쳐도 테스트가 초록으로 남는다.
 */
export const routeTree = rootRoute.addChildren([
  loginRoute,
  authedRoute.addChildren([
    onboardingRoute,
    shellRoute.addChildren([
      dashboardRoute,
      categoryRoute,
      timelineRoute,
      budgetRoute,
      reportRoute,
      chatRoute,
      styleGuideRoute,
    ]),
  ]),
]);

// `defaultPreload: 'intent'` — 호버·터치·포커스 시점에 그 라우트의 청크를 미리 받는다.
//
// **왜 필요한가 (실측 근거)**: lazy 청크는 `dist/index.html` 에 `modulepreload` 가 없어
// 브라우저가 `index.js` 를 **실행해 라우터가 매칭한 뒤에야** 존재를 안다. 실측 워터폴에서
// `/style-guide` 는 index.js 종료 20 ms → 라우트 청크 시작 45 ms 로 **왕복 1회가 통째로 직렬화**됐고,
// 폰트(첫 방문 전송의 81%)가 그 뒤로 밀렸다. 탭 이동도 같은 대가를 매번 치른다.
//
// **왜 지금 켜도 안전한가**: preload 기계는 `Link` 가 무조건 참조하므로 **이미 번들에 실려 있다**
// (배포본 index.js 에 `defaultPreload`·`preloadRoute`·`intent` 문자열 확인). 옵션은 그 코드를
// 쓰게 할 뿐 새 코드를 들이지 않는다. 'intent' 는 호버/터치/포커스에서만 트리거되므로
// **초기 로드에는 아무 영향이 없다** — ADR 0005 R7(LCP·CLS) 측정을 오염시키지 않는다.
//
// ⚠️ 이것은 `defaultPendingComponent` 의 대체가 아니다. 호버 없이 바로 탭하거나 딥링크로 들어오면
// 여전히 대기 구간이 남고, 그동안 화면은 바뀌지 않는다(펜딩 컴포넌트가 없으면 TanStack 은
// 펜딩 타이머를 시작조차 하지 않고 Suspense 경계도 만들지 않는다 — router-core/load-matches.ts).
// 로딩 상태의 **디자인 근거가 docs/design/layout.md §9 에 0건**이라 여기서 지어내지 않는다.
export const router = createRouter({ routeTree, defaultPreload: "intent" });

// 라우트 타입을 전역에 등록한다 — 이게 있어야 `<Link to="…">` 와 `params` 가 **컴파일 타임에** 검증된다.
// ADR 0005 가 28 kB 를 지불하고 산 것이 정확히 이 검사이므로, 이 선언이 사라지면 결정의 근거가 사라진다.
// R5(주입 시험)가 이 등록이 실제로 동작하는지 확인한다.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
