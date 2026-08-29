// 이 컴포넌트가 품고 있는 세 불변식을 고정한다. 셋 다 **실제로 한 번씩 깨져서** 사용자가 신고한
// 것들이고(2026-08-28 온보딩 8단계), jsdom 은 CSS 를 계산하지 않아 눈으로는 확인할 수 없어
// 클래스 계약으로만 지킬 수 있다. 근거는 StatusCallout.tsx 머리말에 있다.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusCallout } from "./StatusCallout";

const MESSAGE = "무언가 잘못됐어요.";

function block() {
  const el = screen.getByText(MESSAGE).parentElement;
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

describe("StatusCallout", () => {
  // 조건부 렌더로 리전을 통째로 마운트하면 스크린리더가 그 등장을 놓치는 경우가 많다 —
  // 라이브 리전은 "이미 존재하는 노드 안에서 일어난 변화"를 본다.
  it("리전(<output>)은 숨어 있을 때도 마운트돼 있다", () => {
    render(<StatusCallout shown={false}><p>{MESSAGE}</p></StatusCallout>);

    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(block().classList.contains("hidden")).toBe(true);
  });

  it("shown 이면 보이고, 아니면 display 로 숨는다", () => {
    const { rerender } = render(<StatusCallout shown><p>{MESSAGE}</p></StatusCallout>);
    expect(block()).toHaveClass("flex", "opacity-100");

    rerender(<StatusCallout shown={false}><p>{MESSAGE}</p></StatusCallout>);
    expect(block()).toHaveClass("hidden", "opacity-0");
  });

  // `display` 는 이산 속성이라 그냥은 전환되지 않는다. `transition-discrete` 가 사라질 때
  // `display:none` 적용을 미루고, `starting:opacity-0` 이 나타날 때 시작 불투명도를 준다 —
  // 하나만 빠지면 그 방향이 조용히 툭 끊긴다.
  it("양방향 페이드의 짝이 유지된다 — 숨김 쪽에도 전환 선언이 있어야 한다", () => {
    const { rerender } = render(<StatusCallout shown><p>{MESSAGE}</p></StatusCallout>);
    expect(block()).toHaveClass("transition-[opacity,display]", "transition-discrete", "starting:opacity-0");

    rerender(<StatusCallout shown={false}><p>{MESSAGE}</p></StatusCallout>);
    // 선언이 없으면 사라지는 프레임이 아예 돌지 않는다.
    expect(block()).toHaveClass("transition-[opacity,display]", "transition-discrete");
  });

  // 🚨 사용자 신고(2026-08-28, "버벅거리며 사라짐"). `allow-discrete` 가 적용을 미뤄 주는 것은
  // `display` 하나뿐이라, 숨김 쪽에서 레이아웃 클래스를 같이 빼면 사라지는 200ms 동안 요소는
  // 아직 flex 인 채로 방향·간격·여백이 즉시 튄다.
  it("두 상태는 display 와 opacity 만 다르다 — 레이아웃이 달라지면 사라질 때 튄다", () => {
    const layoutOf = () =>
      block()
        .className.split(" ")
        .filter((c) => !["flex", "hidden", "opacity-100", "opacity-0", "starting:opacity-0"].includes(c))
        .toSorted();

    const { rerender } = render(<StatusCallout shown><p>{MESSAGE}</p></StatusCallout>);
    const shownLayout = layoutOf();

    rerender(<StatusCallout shown={false}><p>{MESSAGE}</p></StatusCallout>);

    expect(layoutOf()).toEqual(shownLayout);
    // 대조군 — 비교에서 뺀 것 말고 진짜 레이아웃 값이 들어 있어야 위 단언이 의미를 갖는다.
    expect(shownLayout).toEqual(expect.arrayContaining(["mt-4", "flex-col", "gap-1.5"]));
  });

  // `hidden` 과 `flex` 는 둘 다 display 유틸리티라 어느 쪽이 이기는지가 클래스 나열 순서가 아니라
  // 산출 CSS 순서로 정해진다 — 한 요소에 둘을 같이 얹으면 안 된다.
  it("숨김 상태에 flex 가 함께 붙지 않는다", () => {
    render(<StatusCallout shown={false}><p>{MESSAGE}</p></StatusCallout>);
    expect(block()).not.toHaveClass("flex");
  });
});
