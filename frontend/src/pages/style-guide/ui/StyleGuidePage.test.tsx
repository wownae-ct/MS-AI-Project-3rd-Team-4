// 스타일가이드 검증.
//
// 이 화면은 제품 화면이 없는 동안 디자인 시스템이 실제로 동작하는지 확인하는 실체다.
// 그래서 테스트도 "보기 좋은가"가 아니라 **계약이 지켜지는가**를 고정한다 —
// 접근명, 키보드 동작, 금액 표기 규범.
//
// 셀렉터는 role/label/text 만 쓴다. 클래스명·data-testid·스냅샷을 쓰지 않는다 —
// 스타일을 바꿀 때마다 테스트가 깨지면 테스트가 리팩터링을 막는 족쇄가 된다.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StyleGuidePage } from "./StyleGuidePage";

describe("스타일가이드 골격", () => {
  it("제목과 본문 건너뛰기 링크를 제공한다", () => {
    render(<StyleGuidePage />);
    expect(screen.getByRole("heading", { level: 1, name: "디자인 시스템" })).toBeInTheDocument();
    // 스킵 링크는 sr-only 라 보이지 않지만 접근성 트리에는 있어야 한다.
    expect(screen.getByRole("link", { name: "본문으로 건너뛰기" })).toBeInTheDocument();
  });

  it("주요 절을 h2 로 구성한다 — 제목 위계를 건너뛰지 않는다", () => {
    render(<StyleGuidePage />);
    const sections = screen.getAllByRole("heading", { level: 2 });
    expect(sections.length).toBeGreaterThanOrEqual(8);
  });
});

describe("금액 표기 규범", () => {
  it("KRW 정수를 콤마로 끊어 표시한다 — 소수점을 만들지 않는다", () => {
    render(<StyleGuidePage />);
    expect(screen.getByText("12,400,000원")).toBeInTheDocument();
    expect(screen.getByText("9,800,000원")).toBeInTheDocument();
  });
});

describe("진행률", () => {
  it("각 진행률에 무엇의 진행인지 이름이 붙어 있다", () => {
    render(<StyleGuidePage />);
    expect(screen.getByRole("progressbar", { name: "작업 진행률" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "사용량" })).toBeInTheDocument();
  });

  it("값을 주지 않으면 불확정 상태다 — 0%로 단정하지 않는다", () => {
    render(<StyleGuidePage />);
    const loading = screen.getByRole("progressbar", { name: "불러오는 중" });
    expect(loading).not.toHaveAttribute("aria-valuenow");
  });

  it("값을 주면 백분율로 알린다", () => {
    render(<StyleGuidePage />);
    expect(screen.getByRole("progressbar", { name: "작업 진행률" })).toHaveAttribute(
      "aria-valuenow",
      "35",
    );
  });
});

describe("탭 — 키보드 접근성", () => {
  it("첫 탭이 선택된 상태로 시작한다", () => {
    render(<StyleGuidePage />);
    expect(screen.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/첫 번째 패널/u);
  });

  // 활성화는 수동이다 — 화살표는 포커스만 옮기고 Enter/Space 가 선택한다.
  // 자동 활성화가 아닌 이유는 Tabs.tsx 주석 참조.
  // 이 두 테스트가 그 계약을 고정한다 — 나중에 자동 활성화로 바꾸면 여기서 걸린다.
  it("화살표 키는 포커스만 옮긴다 — 지나치는 탭을 활성화하지 않는다", async () => {
    const user = userEvent.setup();
    render(<StyleGuidePage />);

    await user.click(screen.getByRole("tab", { name: "개요" }));
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "상세" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "상세" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/첫 번째 패널/u);
  });

  it("Enter 로 포커스한 탭을 활성화한다 — 마우스 없이 완주 가능해야 한다", async () => {
    const user = userEvent.setup();
    render(<StyleGuidePage />);

    await user.click(screen.getByRole("tab", { name: "개요" }));
    await user.keyboard("{ArrowRight}{Enter}");

    expect(screen.getByRole("tab", { name: "상세" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/두 번째 패널/u);
  });
});

describe("규범 표시", () => {
  it("아직 확정되지 않은 결정을 화면에 드러낸다 — 조용히 넘기지 않는다", () => {
    render(<StyleGuidePage />);
    expect(screen.getAllByText("열린 결정").length).toBeGreaterThanOrEqual(3);
  });

  it("지금 쓰지 않기로 한 것을 명시한다", () => {
    render(<StyleGuidePage />);
    expect(screen.getByText("다크모드")).toBeInTheDocument();
    expect(screen.getByText("그림자")).toBeInTheDocument();
  });
});
