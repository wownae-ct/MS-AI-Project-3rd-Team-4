// Button 의 pending 계약 — D14 L1 계층.
//
// 이 prop 이 막는 것은 **연타**다. 로그아웃처럼 왕복이 끝나기 전에 한 번 더 눌릴 수 있는 버튼이
// 실제로 그 상태였다(무표시 + 비활성 아님). 라벨만 바꾸고 비활성을 잊으면 그 결함이 그대로 남으므로
// 둘을 한 prop 으로 묶어 **잊을 수 없게** 한다.
//
// 앰비언트 로딩(`Loading`)과 달리 **지연이 없다** — 사용자가 방금 누른 컨트롤이라 즉각 반응이
// 곧 확인이고, 지연을 두면 그 사이 두 번째 클릭이 통과한다.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button — pending", () => {
  it("pending 이면 즉시 비활성이다 — 지연이 없다", () => {
    render(<Button pending>로그아웃</Button>);

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("pending 이면 진행 중임을 보조기기에도 알린다", () => {
    render(<Button pending>로그아웃</Button>);

    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });

  it("pendingLabel 을 주면 라벨을 바꾼다", () => {
    render(
      <Button pending pendingLabel="로그아웃 중…">
        로그아웃
      </Button>,
    );

    expect(screen.getByRole("button", { name: "로그아웃 중…" })).toBeInTheDocument();
  });

  it("pendingLabel 이 없으면 원래 라벨을 그대로 둔다", () => {
    render(<Button pending>보내기</Button>);

    expect(screen.getByRole("button", { name: "보내기" })).toBeInTheDocument();
  });

  // 연타 방지가 이 prop 의 존재 이유다.
  it("pending 중에는 클릭이 핸들러에 닿지 않는다", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button pending onClick={onClick}>
        로그아웃
      </Button>,
    );

    await user.click(screen.getByRole("button"));

    expect(onClick).not.toHaveBeenCalled();
  });

  // "진행 중"과 "원래 못 누름"은 서로 다른 이유다 — 한쪽이 다른 쪽을 되살리면 안 된다.
  it("호출부가 넘긴 disabled 를 pending 이 덮어쓰지 않는다", () => {
    render(
      <Button disabled pending={false}>
        준비 중
      </Button>,
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });

  // 기존 호출부(수십 곳)가 이 prop 을 모른다 — 그쪽 동작이 바뀌지 않는 것이 계약이다.
  it("pending 을 주지 않으면 아무것도 달라지지 않는다", () => {
    render(<Button>저장</Button>);

    const button = screen.getByRole("button", { name: "저장" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-busy");
  });
});

// size 계약 — docs/design/a11y.md §1.5 의 44px 터치 타겟은 `sm` 에서도 유지된다.
//
// **왜 클래스 문자열을 단언하는가.** 이 저장소가 일반적으로 하지 않는 일이지만(구현 세부에
// 테스트를 묶는다), 여기서는 그것이 정확히 필요한 것이다 — jsdom 은 레이아웃을 계산하지 않아
// 「이 버튼의 히트 영역이 44px 인가」를 실제 크기로 물을 수단이 없고, 짝이 깨져도 **화면에는
// 아무 변화가 없다**(36px 상자는 그대로 보인다). Badge.test.tsx 가 D16 의
// `shrink-0`/`whitespace-nowrap` 짝을 같은 이유로 같은 방식으로 고정한다.
describe("Button — size", () => {
  it("sm 은 36px 상자와 44px 히트 영역을 **함께** 갖는다", () => {
    render(
      <Button size="sm" variant="secondary">
        지난 대화
      </Button>,
    );

    const button = screen.getByRole("button", { name: "지난 대화" });
    // 보이는 높이 36px
    expect(button.className).toContain("h-9");
    // 위아래 4px 씩 넘치는 의사요소 — 이 셋이 함께 있어야 44px 가 된다.
    expect(button.className).toContain("relative");
    expect(button.className).toContain("after:absolute");
    expect(button.className).toContain("after:-inset-y-1");
  });

  it("기본값은 md 다 — size 를 모르는 기존 호출부는 44px 상자를 그대로 쓴다", () => {
    render(<Button>저장</Button>);

    const button = screen.getByRole("button", { name: "저장" });
    expect(button.className).toContain("min-h-tap");
    expect(button.className).not.toContain("h-9");
  });
});
