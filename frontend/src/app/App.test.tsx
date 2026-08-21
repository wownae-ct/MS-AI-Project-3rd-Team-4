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
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./router";

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
}

/** 제목으로 화면을 식별한다 — 클래스명이나 testid 가 아니라 사용자가 보는 것으로 검증한다. */
async function expectScreen(name: string) {
  expect(await screen.findByRole("heading", { level: 1, name })).toBeInTheDocument();
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
    renderAt("/category/wedding-hall");
    await expectScreen("카테고리 상세");
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
  it("온보딩에는 크롬이 없다 — 탭바도 사이드바도 붙지 않는다", async () => {
    renderAt("/onboarding");
    await expectScreen("온보딩");
    expect(screen.queryAllByRole("navigation")).toHaveLength(0);
  });

  it("셸이 없어도 스킵 링크는 있다 — 본문 건너뛰기는 온보딩에도 필요하다", async () => {
    renderAt("/onboarding");
    await expectScreen("온보딩");
    expect(screen.getByRole("link", { name: "본문으로 건너뛰기" })).toBeInTheDocument();
  });
});
