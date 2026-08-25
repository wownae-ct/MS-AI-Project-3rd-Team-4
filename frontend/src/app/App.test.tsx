// 라우팅 조립 검증 (ADR 0005).
//
// 고정하는 것은 "화면이 예쁜가"가 아니라 **트리가 계약대로 배선됐는가**다:
//   · 경로 → 화면 매핑 (layout.md §2 라우트 표)
//   · 셸의 소재 — 온보딩만 크롬이 없다 (layout.md §1)
//   · 스킵 링크는 셸 밖 화면에도 있다
//
// 테스트용 트리를 따로 만들지 않는다 — 실제 `routeTree` 를 메모리 히스토리로 다시 조립한다.
// 별도 트리를 쓰면 라우트를 잘못 고쳐도 테스트가 초록으로 남아 검증이 무의미해진다.
//
// 왜 `findBy*` 인가 — 첫 화면 말고는 전부 `lazyRouteComponent` 라 **비동기로 도착**한다.
// `getBy*` 로 잡으면 lazy 화면에서 실패하고, 그 실패는 "라우팅이 틀렸다"로 오독되기 쉽다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { ApiError } from "@/shared/api";
import { routeTree } from "./router";

const getMeMock = vi.fn();
vi.mock("@/entities/session", async (orig) => ({
  ...(await orig<typeof import("@/entities/session")>()),
  // 가드가 부르는 것은 loadSession 이다 — 캐시를 거치지 않으면 네비게이션마다 왕복한다.
  loadSession: () => getMeMock(),
}));

// 이 파일은 라우팅 조립(경로 → 화면 · 가드 · 셸 소재)만 본다 — 화면이 실제로 그리는 데이터는
// 관심사가 아니다(그건 DashboardPage.test.tsx 등 각 화면 계약 테스트의 몫이다). 그런데
// CategoryPage(getCategories)와 OnboardingPage(getCategories/getTotalAverageBenchmark)가 실API
// 배선 이후 진짜 네트워크 호출을 시도하면, `VITE_API_BASE=https://api.test`(존재하지 않는
// 도메인)로의 DNS 실패가 전체 스위트를 병렬로 돌릴 때 간헐적으로 findBy* 기본 타임아웃을
// 넘겨 테스트를 깨뜨린다(고립 실행에선 통과, 전체 스위트에선 가끔 실패 — 재현됨). 라우팅
// 조립과 무관한 네트워크 의존을 없애기 위해 여기서 즉시 응답하는 목으로 바꾼다.
vi.mock("@/entities/wedding", async (orig) => ({
  ...(await orig<typeof import("@/entities/wedding")>()),
  getCategories: () => Promise.resolve({ categories: [] }),
  getTotalAverageBenchmark: () =>
    Promise.reject(new ApiError({ code: "TOTAL_BUDGET_UNAVAILABLE", message: "x", status: 404, extra: {} })),
}));

beforeEach(() => {
  getMeMock.mockReset();
  getMeMock.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: true });
});

function unauthorized() {
  return new ApiError({ code: "UNAUTHORIZED", message: "로그인이 필요합니다.", status: 401, extra: {} });
}

// 반환값(router)은 대부분의 호출자가 무시한다 — 화면 제목만 보는 테스트는 그걸로 충분하다.
// redirect 검색 파라미터처럼 **화면에 안 보이는 값**을 검증할 때만 router.state 를 읽는다.
function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

/**
 * 제목으로 화면을 식별한다 — 클래스명이나 testid 가 아니라 사용자가 보는 것으로 검증한다.
 *
 * 타임아웃을 기본값(1000ms)보다 넉넉히 준다 — `CategoryPage`/`OnboardingPage`는 실API 배선
 * 이후 다른 lazy 화면보다 훨씬 큰 청크(탭 3개 + entities, 8단계 위저드)를 동적 import 하므로,
 * 전체 스위트를 병렬로 돌릴 때(CPU 경합)는 기본 타임아웃을 넘기고서야 로드가 끝나는 경우가
 * 실측으로 확인됐다(고립 실행에선 항상 통과, 전체 스위트에선 간헐적 실패) — 로직 결함이
 * 아니라 순수 로딩 시간 여유 부족이었다.
 */
async function expectScreen(name: string) {
  expect(await screen.findByRole("heading", { level: 1, name }, { timeout: 5000 })).toBeInTheDocument();
}

describe("경로 → 화면 (layout.md §2 라우트 표)", () => {
  it("루트는 대시보드다", async () => {
    renderAt("/");
    await expectScreen("대시보드");
  });

  it("타임라인 · 예산 · 리포트가 각자 경로를 갖는다", async () => {
    renderAt("/timeline");
    await expectScreen("타임라인");
  });

  it("카테고리 상세는 경로 파라미터를 받는다", async () => {
    // `$id` 를 `:id` 로 적으면 리터럴 경로가 되어 조용히 매칭되지 않는다 — 그 회귀를 여기서 잡는다.
    // 카테고리 상수 조회(`GET /categories`)를 이 테스트는 목으로 두지 않으므로 실패하고,
    // `CategoryPage`는 그 경우 제목을 원본 `categoryCode`로 폴백한다(CategoryPage.tsx) — 그
    // 폴백값이 곧 `$id`가 실제로 라우트에 전달됐다는 증거다.
    renderAt("/category/wedding-hall");
    await expectScreen("wedding-hall");
  });

  it("스타일가이드는 라우트로 남는다 — 화면이 생겨도 참조 문서로 계속 쓴다", async () => {
    renderAt("/style-guide");
    await expectScreen("디자인 시스템");
  });

  it("본문 영역이 main 랜드마크로 노출된다", async () => {
    renderAt("/");
    await expectScreen("대시보드");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});

describe("셸의 소재 (layout.md §1)", () => {
  it("셸이 붙는 화면에는 내비게이션이 있다", async () => {
    renderAt("/");
    await expectScreen("대시보드");
    expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0);
  });

  // 온보딩만 크롬이 없다. 이건 AppShell 안의 조건 분기가 아니라 **트리 구조**로 표현돼 있다 —
  // 온보딩 라우트가 `_shell` 밖에 있다. 그 구조가 유지되는지를 여기서 고정한다.
  //
  // ⚠️ 웨딩이 있으면(beforeEach 기본값) 이제 `/onboarding` 자체가 `/` 로 리다이렉트된다
  //    (§가드 테스트). 그래서 여기서는 온보딩 화면에 실제로 도달하는 상태 — 웨딩 없음 —
  //    을 명시로 준다. 이 테스트가 보는 것은 가드가 아니라 "온보딩 화면에 셸이 없다"이다.
  it("온보딩에는 크롬이 없다 — 탭바도 사이드바도 붙지 않는다", async () => {
    getMeMock.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: false });
    renderAt("/onboarding");
    // OnboardingPage 실 배선 이후 제목은 고정 문구 "온보딩"이 아니라 1단계 헤드라인이다
    // (OnboardingPage.tsx STEP_HEADLINE).
    await expectScreen("당신에 대해 알려주세요");
    expect(screen.queryAllByRole("navigation")).toHaveLength(0);
  });

  it("셸이 없어도 스킵 링크는 있다 — 본문 건너뛰기는 온보딩에도 필요하다", async () => {
    getMeMock.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: false });
    renderAt("/onboarding");
    // OnboardingPage 실 배선 이후 제목은 고정 문구 "온보딩"이 아니라 1단계 헤드라인이다
    // (OnboardingPage.tsx STEP_HEADLINE).
    await expectScreen("당신에 대해 알려주세요");
    expect(screen.getByRole("link", { name: "본문으로 건너뛰기" })).toBeInTheDocument();
  });
});

describe("가드 — 세션과 웨딩을 두 층으로 나눈다", () => {
  it("미인증으로 / 에 들어오면 /login 으로 간다", async () => {
    getMeMock.mockRejectedValue(unauthorized());
    renderAt("/");
    await expectScreen("로그인");
  });

  it("로그인했지만 웨딩이 없으면 온보딩으로 간다", async () => {
    getMeMock.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: false });
    renderAt("/");
    // OnboardingPage 실 배선 이후 제목은 고정 문구 "온보딩"이 아니라 1단계 헤드라인이다
    // (OnboardingPage.tsx STEP_HEADLINE).
    await expectScreen("당신에 대해 알려주세요");
  });

  it("웨딩이 있으면 대시보드가 그대로 보인다", async () => {
    getMeMock.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: true });
    renderAt("/");
    await expectScreen("대시보드");
  });

  // 한 층으로 합치면 여기서 무한 리다이렉트가 난다 — 그 회귀를 고정한다.
  it("웨딩이 있는 사용자가 /onboarding 에 들어오면 홈으로 되돌아온다", async () => {
    getMeMock.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: true });
    renderAt("/onboarding");
    await expectScreen("대시보드");
  });

  it("웨딩이 없는 사용자는 온보딩에 머무른다 — 되돌려 보내면 루프다", async () => {
    getMeMock.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: false });
    renderAt("/onboarding");
    // OnboardingPage 실 배선 이후 제목은 고정 문구 "온보딩"이 아니라 1단계 헤드라인이다
    // (OnboardingPage.tsx STEP_HEADLINE).
    await expectScreen("당신에 대해 알려주세요");
  });

  it("/login 은 세션이 있어도 열린다 — 가입 직후 자동 채움 경로가 여기를 지난다", async () => {
    getMeMock.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: true });
    renderAt("/login");
    await expectScreen("로그인");
  });

  it("네트워크 실패는 로그인으로 보낸다 — 흰 화면으로 두지 않는다", async () => {
    getMeMock.mockRejectedValue(new ApiError({ code: "NETWORK_ERROR", message: "x", status: 0, extra: {} }));
    renderAt("/");
    await expectScreen("로그인");
  });
});

// 리뷰 Finding 2 — `?redirect=` 는 밖에서 들어오는 값이라 무방비로 통과시키면 열린 리다이렉트가 된다.
// 앱 스스로 만드는 값(authedRoute.beforeLoad 의 location.href)은 항상 "/"로 시작하는 내부 경로라
// 여기 안 걸리고, 공격자가 URL 에 심는 값만 이 경계에서 걸러져야 한다.
describe("redirect 검색 파라미터 — 열린 리다이렉트를 /login 경계에서 막는다", () => {
  it("내부 경로는 그대로 통과한다", async () => {
    const router = renderAt("/login?redirect=%2Ftimeline");
    await expectScreen("로그인");
    expect(router.state.location.search.redirect).toBe("/timeline");
  });

  it("스킴이 있는 외부 URL 은 버려진다", async () => {
    const router = renderAt(`/login?redirect=${encodeURIComponent("https://evil.example")}`);
    await expectScreen("로그인");
    expect(router.state.location.search.redirect).toBeUndefined();
  });

  // "/"로 시작해서 언뜻 내부 경로처럼 보이지만, 두 번째 슬래시가 스킴을 현재 것으로 물려받는
  // 프로토콜 상대 URL 을 만든다 — 흔히 놓치는 함정이라 이름을 박아 둔다.
  it("프로토콜 상대 URL(//evil.example) 은 버려진다", async () => {
    const router = renderAt(`/login?redirect=${encodeURIComponent("//evil.example")}`);
    await expectScreen("로그인");
    expect(router.state.location.search.redirect).toBeUndefined();
  });

  it("백슬래시로 시작하는 값도 버려진다 — 일부 브라우저가 슬래시로 취급한다", async () => {
    const router = renderAt(`/login?redirect=${encodeURIComponent("\\evil.example")}`);
    await expectScreen("로그인");
    expect(router.state.location.search.redirect).toBeUndefined();
  });
});

// Minor — sanitizeRedirectTarget 이 값을 거르는 것과, _authed 가 애초에 올바른 값을 채워 넣는 것은
// 별개다. 이 메커니즘 자체가 이번 태스크 산출물이라 실제로 채워지는지 확인해 둔다.
describe("redirect 검색 파라미터 — _authed 가드가 실제로 채운다", () => {
  it("미인증으로 /timeline 에 들어오면 그 경로가 redirect 로 실린다", async () => {
    getMeMock.mockRejectedValue(unauthorized());
    const router = renderAt("/timeline");
    await expectScreen("로그인");
    expect(router.state.location.search.redirect).toBe("/timeline");
  });
});
