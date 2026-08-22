// S2 대시보드 계약 (시각 스펙: docs/mockups/s2-dashboard.html).
//
// **무엇을 테스트하고 무엇을 테스트하지 않는가**
// 색·라운드·그림자는 빌드 게이트(산출 CSS 파서)가 이미 강제한다 — 여기서 클래스를 단언하지 않는다.
// 여기서 고정하는 것은 **CSS 로 검사할 수 없는 것**뿐이다: 문서 구조(제목 레벨) · 접근명 ·
// 색 이외의 전달 수단 · 셸과 화면의 소유 경계.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardPage } from "./DashboardPage";

describe("카드 구조", () => {
  // 목업의 카드 3개(s2:157,186,217)는 `<p class="card-title">` 이지만 규범은 h2 다
  // (a11y.md §4 제목 계층 — WCAG 1.3.1 F2). Card 의 title 슬롯이 이것을 강제한다.
  it("카드 3개가 각각 레벨 2 제목을 갖는다", () => {
    render(<DashboardPage />);

    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(["예산 현황", "다가오는 납부", "카테고리별 예산"]);
  });
});

describe("예산 도넛 — 색만으로 전달하지 않는다", () => {
  // WCAG 1.4.1. 도넛은 conic-gradient 3계열이라 **색 자체가 유일한 구분 수단**이 되기 쉽다.
  // 목업이 범례에 라벨과 금액을 함께 둔 것(s2:165-181)이 그 대비책이고, 그 대비책이
  // 사라지지 않도록 여기서 고정한다.
  it("3계열이 라벨 텍스트로도 제공된다", () => {
    render(<DashboardPage />);

    expect(screen.getByText("집행")).toBeInTheDocument();
    expect(screen.getByText("계획(미지급)")).toBeInTheDocument();
    expect(screen.getByText("미배정")).toBeInTheDocument();
  });
});

describe("카테고리별 예산", () => {
  // Progress 는 label 을 필수로 받는다. 바가 여러 개인 화면에서 접근명이 같으면
  // 스크린리더 사용자에게 "진행률 6개"가 전부 구분되지 않는다.
  it("진행률 바마다 어느 카테고리인지 말한다 — 접근명이 서로 다르다", () => {
    render(<DashboardPage />);

    const names = screen.getAllByRole("progressbar").map((bar) => bar.getAttribute("aria-label"));

    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("예식장 예산 집행률");
  });

  // 목업의 「상견례」 행(s2:219-224)은 `.no-cost` 라 금액도 바도 없다 — 비용이 없는
  // 카테고리가 0% 바를 그리면 "예산이 있는데 하나도 안 썼다"로 읽힌다.
  // Progress.tsx 가 불확정을 0%로 그리지 않기로 한 것과 같은 종류의 구분이다.
  it("비용이 없는 카테고리는 진행률 바를 그리지 않는다", () => {
    render(<DashboardPage />);

    expect(screen.getByText("상견례")).toBeInTheDocument();
    const names = screen.getAllByRole("progressbar").map((bar) => bar.getAttribute("aria-label"));
    expect(names).not.toContain("상견례 예산 집행률");
  });
});

describe("셸과 화면의 경계", () => {
  // 목업은 셸이 없던 시절 사본이라 브랜드 블록이 화면 안에 있다(s2:146-149).
  // layout.md §4 는 브랜드를 **사이드바 소관**으로 뒀다 — 화면이 함께 그리면 데스크톱에서 두 번 나온다.
  it("브랜드를 화면이 그리지 않는다 — 셸 소관이다", () => {
    render(<DashboardPage />);

    expect(screen.queryByText("메리맵")).not.toBeInTheDocument();
  });
});
