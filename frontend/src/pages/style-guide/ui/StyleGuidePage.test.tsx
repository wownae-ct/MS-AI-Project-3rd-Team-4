// 스타일가이드 검증.
//
// 이 화면은 제품 화면이 없는 동안 디자인 시스템이 실제로 동작하는지 확인하는 실체다.
// 그래서 테스트도 "보기 좋은가"가 아니라 **계약이 지켜지는가**를 고정한다 —
// 접근명, 키보드 동작, 금액 표기 규범.
//
// 셀렉터는 role/label/text 만 쓴다. 클래스명·data-testid·스냅샷을 쓰지 않는다 —
// 스타일을 바꿀 때마다 테스트가 깨지면 테스트가 리팩터링을 막는 족쇄가 된다.
//
// ⚠️ [2026-08-30, D25] 이 파일은 오래 `render(<StyleGuidePage />)` 로 컴포넌트 하나만 렌더했다.
// 제목 위에 「뒤로」(`shared/ui/BackLink.tsx`)가 붙으면서 라우터 컨텍스트가 필요해졌다
// (`useRouter()`/`useCanGoBack()` 은 프로바이더 없이 던진다). 아래 `renderStyleGuide()` 가
// 메모리 히스토리로 최소 트리를 조립한다 — 조립 방식은 SettingsPage.test.tsx 와 같다.
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { StyleGuidePage } from "./StyleGuidePage";

// `RouterProvider` 의 첫 렌더는 **비동기**다 — 화면이 도착할 때까지 기다렸다 돌려준다.
async function renderStyleGuide() {
  const rootRoute = createRootRoute({ component: StyleGuidePage });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/", "/style-guide"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { level: 1, name: "디자인 시스템" });
}

describe("스타일가이드 골격", () => {
  // 스킵 링크 단언은 여기 있었지만 `app/App.test.tsx` 로 **이관했다** — 지운 게 아니다.
  // 라우터 도입(ADR 0005)으로 스킵 링크가 `Page` 에서 루트 라우트로 올라갔고(layout.md §6),
  // 계약의 소재지가 옮겨졌으면 그것을 지키는 테스트도 함께 옮긴다. 화면 하나에 묶어 두면
  // "그 화면에서만" 보장되고 정작 온보딩처럼 셸 밖 화면이 비어도 아무도 모른다.
  it("제목을 제공한다", async () => {
    await renderStyleGuide();
    expect(screen.getByRole("heading", { level: 1, name: "디자인 시스템" })).toBeInTheDocument();
  });

  it("주요 절을 h2 로 구성한다 — 제목 위계를 건너뛰지 않는다", async () => {
    await renderStyleGuide();
    const sections = screen.getAllByRole("heading", { level: 2 });
    expect(sections.length).toBeGreaterThanOrEqual(8);
  });
});

describe("금액 표기 규범", () => {
  it("KRW 정수를 콤마로 끊어 표시한다 — 소수점을 만들지 않는다", async () => {
    await renderStyleGuide();
    expect(screen.getByText("12,400,000원")).toBeInTheDocument();
    expect(screen.getByText("9,800,000원")).toBeInTheDocument();
  });
});

describe("진행률", () => {
  it("각 진행률에 무엇의 진행인지 이름이 붙어 있다", async () => {
    await renderStyleGuide();
    expect(screen.getByRole("progressbar", { name: "작업 진행률" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "사용량" })).toBeInTheDocument();
  });

  it("값을 주지 않으면 불확정 상태다 — 0%로 단정하지 않는다", async () => {
    await renderStyleGuide();
    const loading = screen.getByRole("progressbar", { name: "불러오는 중" });
    expect(loading).not.toHaveAttribute("aria-valuenow");
  });

  // 회귀 방지 — 한때 불확정 막대가 **100% 채워진 완료 상태와 똑같이** 그려졌다.
  // Base UI 가 값이 없으면 인라인 width 를 설정하지 않아 width:auto 가 트랙 전체로 계산됐다.
  //
  // data-indeterminate 는 클래스명이 아니라 Base UI 가 내보내는 **상태 속성**이다(role·aria 와 같은 계약).
  // 다만 jsdom 은 레이아웃을 계산하지 않으므로 "폭이 100%가 아니다"는 여기서 검증할 수 없다 —
  // 이 단언이 고정하는 것은 **상태가 DOM 에 드러나 CSS 가 두 경우를 구분할 수 있다**는 것까지다.
  // 실제 폭은 산출 CSS 에 `[data-indeterminate]{width:…}` 규칙이 생성되는 것으로 확인한다.
  it("불확정 막대는 완료 막대와 DOM 에서 구분된다", async () => {
    await renderStyleGuide();
    const loading = screen.getByRole("progressbar", { name: "불러오는 중" });
    const done = screen.getByRole("progressbar", { name: "사용량" });

    expect(loading.querySelector("[data-indeterminate]")).not.toBeNull();
    expect(done.querySelector("[data-indeterminate]")).toBeNull();
  });

  it("값을 주면 백분율로 알린다", async () => {
    await renderStyleGuide();
    expect(screen.getByRole("progressbar", { name: "작업 진행률" })).toHaveAttribute(
      "aria-valuenow",
      "35",
    );
  });
});

describe("탭 — 키보드 접근성", () => {
  it("첫 탭이 선택된 상태로 시작한다", async () => {
    await renderStyleGuide();
    expect(screen.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/첫 번째 패널/u);
  });

  // 활성화는 수동이다 — 화살표는 포커스만 옮기고 Enter/Space 가 선택한다.
  // 자동 활성화가 아닌 이유는 Tabs.tsx 주석 참조.
  // 이 두 테스트가 그 계약을 고정한다 — 나중에 자동 활성화로 바꾸면 여기서 걸린다.
  it("화살표 키는 포커스만 옮긴다 — 지나치는 탭을 활성화하지 않는다", async () => {
    const user = userEvent.setup();
    await renderStyleGuide();

    await user.click(screen.getByRole("tab", { name: "개요" }));
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "상세" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "상세" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/첫 번째 패널/u);
  });

  it("Enter 로 포커스한 탭을 활성화한다 — 마우스 없이 완주 가능해야 한다", async () => {
    const user = userEvent.setup();
    await renderStyleGuide();

    await user.click(screen.getByRole("tab", { name: "개요" }));
    await user.keyboard("{ArrowRight}{Enter}");

    expect(screen.getByRole("tab", { name: "상세" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/두 번째 패널/u);
  });
});

describe("규범 표시", () => {
  // 개수 하한(>= 3)을 단언하지 않는다 — D6 이 하나를 닫고 D2 가 하나를 열어 우연히 3 이 유지됐는데,
  // 그 우연에 기대면 닫힌 결정이 다시 열려도(또는 그 반대여도) 테스트가 모른다. 어떤 것이 열려 있고
  // 어떤 것이 닫혔는지 내용으로 단언한다.
  it("아직 확정되지 않은 결정을 화면에 드러낸다 — 조용히 넘기지 않는다", async () => {
    await renderStyleGuide();
    expect(screen.getAllByText("열린 결정").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/지원 브라우저 범위가 확정되지 않았습니다/u)).toBeInTheDocument();
  });

  it("닫은 결정은 규범으로 표시한다 — 상태 색(D6) · primary 면적(D2)", async () => {
    await renderStyleGuide();
    // D6은 2026-08-26에 D12가 업체 사례 GOOD 배지 한 곳에 한해 좁게 뒤집었다 — 문구도 "원칙적으로"로
    // 바뀌었다(decisions.md D6/D12, FoundationSection.tsx). 전면 폐기가 아니라는 것은 아래 예외
    // 문구 단언이 고정한다.
    expect(screen.getByText(/상태 색\(성공 · 경고 · 위험\)은 원칙적으로 도입하지 않습니다/u)).toBeInTheDocument();
    expect(screen.getByText(/업체 사례의 「잘한 사례」 배지만 예외/u)).toBeInTheDocument();
    // D2 는 2026-08-22 에 닫혔다. 「열린 결정」 쪽에 있던 단언을 여기로 옮긴 것이라, 문구가
    // 어느 쪽에도 없으면 이 단언이 실패한다 — 규범이 조용히 사라지지 않는다.
    expect(screen.getByText(/카드 전면 채움은 하지 않습니다/u)).toBeInTheDocument();
  });

  it("지금 쓰지 않기로 한 것을 명시한다", async () => {
    await renderStyleGuide();
    expect(screen.getByText("다크모드")).toBeInTheDocument();
    expect(screen.getByText("그림자")).toBeInTheDocument();
    expect(screen.getByText("ring-*")).toBeInTheDocument();
  });

  it("라운드 4단계를 카탈로그로 보여 준다 (D1)", async () => {
    await renderStyleGuide();
    // "16px" 는 타이포 절에도 있다 — 형태 절 안에서만 찾는다.
    const heading = screen.getByRole("heading", { level: 2, name: "형태" });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    for (const px of ["8px", "10px", "16px", "999px"]) {
      expect(within(section as HTMLElement).getByText(px)).toBeInTheDocument();
    }
  });
});
