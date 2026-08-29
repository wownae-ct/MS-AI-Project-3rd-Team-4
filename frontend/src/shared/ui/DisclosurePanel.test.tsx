// 이 컴포넌트가 품고 있는 네 불변식을 고정한다. 넷 다 **실제로 한 번씩 깨져서** 사용자가 신고한
// 것들이고(2026-08-28 온보딩 8단계), jsdom 은 CSS 를 계산하지 않아 눈으로는 확인할 수 없어
// 클래스·속성 계약으로만 지킬 수 있다. 근거는 DisclosurePanel.tsx 머리말에 있다.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DisclosurePanel } from "./DisclosurePanel";

const PANEL_ID = "test-panel";

function panel() {
  const el = document.querySelector(`#${PANEL_ID}`);
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

function content() {
  const el = screen.getByLabelText("금액").closest(".overflow-hidden")?.firstElementChild;
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

function renderPanel(open: boolean, focusOnOpen?: boolean) {
  return render(
    <DisclosurePanel id={PANEL_ID} open={open} focusOnOpen={focusOnOpen}>
      <input aria-label="금액" />
    </DisclosurePanel>,
  );
}

describe("DisclosurePanel", () => {
  // `max-height` 매직 넘버로 되돌아가면(콘텐츠가 그 값을 넘으면 잘린다) 이 테스트가 잡는다.
  it("높이를 0fr↔1fr 로 전환한다", () => {
    const { rerender } = renderPanel(false);
    expect(panel()).toHaveClass("grid-rows-[0fr]", "transition-[grid-template-rows]");

    rerender(
      <DisclosurePanel id={PANEL_ID} open>
        <input aria-label="금액" />
      </DisclosurePanel>,
    );
    expect(panel()).toHaveClass("grid-rows-[1fr]", "transition-[grid-template-rows]");
  });

  // 접히는 애니메이션이 돌려면 마운트를 유지해야 하고, 그러면 높이 0으로 잘렸을 뿐 DOM 에는
  // 그대로 남아 Tab 이 들어간다 — `inert` 가 그걸 막는다.
  it("접혀 있으면 안쪽이 inert 라 탭 순서·접근성 트리에서 빠진다", () => {
    const { rerender } = renderPanel(false);
    expect(screen.getByLabelText("금액").closest("[inert]")).not.toBeNull();

    rerender(
      <DisclosurePanel id={PANEL_ID} open>
        <input aria-label="금액" />
      </DisclosurePanel>,
    );
    expect(screen.getByLabelText("금액").closest("[inert]")).toBeNull();
  });

  // 🚨 사용자 신고(2026-08-28, "입력창 포커스 좌측과 하단이 카드 틀에 잘림"). 안쪽
  // `overflow-hidden` 은 높이만이 아니라 박스 밖 4px(포커스 테두리)까지 함께 자른다.
  // 클리퍼를 카드 패딩만큼 흘리고(`-mx-4`) 콘텐츠를 같은 값만큼 되돌리는(`mx-4`) 짝으로 막는데,
  // **둘 중 하나만 지우면** 잘림이 돌아오거나(둘 다 제거) 내용이 카드의 다른 줄과 어긋난다.
  it("포커스 링이 잘리지 않도록 클리퍼 흘림과 콘텐츠 되돌림이 짝을 이룬다", () => {
    renderPanel(true);

    expect(panel()).toHaveClass("-mx-4");
    expect(content()).toHaveClass("mx-4");
    // 아래쪽은 음수 여백을 못 쓴다(접혔을 때 카드 패딩을 먹는다) — 안쪽 여유로 확보한다.
    expect(content()).toHaveClass("pb-1.5");
  });

  it("열리면 안쪽 첫 입력으로 포커스를 옮긴다", () => {
    const { rerender } = renderPanel(false);
    expect(screen.getByLabelText("금액")).not.toHaveFocus();

    rerender(
      <DisclosurePanel id={PANEL_ID} open>
        <input aria-label="금액" />
      </DisclosurePanel>,
    );
    expect(screen.getByLabelText("금액")).toHaveFocus();
  });

  it("focusOnOpen=false 면 포커스를 건드리지 않는다", () => {
    const { rerender } = renderPanel(false, false);

    rerender(
      <DisclosurePanel id={PANEL_ID} open focusOnOpen={false}>
        <input aria-label="금액" />
      </DisclosurePanel>,
    );
    expect(screen.getByLabelText("금액")).not.toHaveFocus();
  });

  // `divider={false}`(2026-08-29) — 카드 **본문 교체** 용도. 두 패널을 겹쳐 쓰면 접힌 쪽의
  // 구분선까지 세로 여백으로 남아 카드가 어긋난다(pages/budget/ui/CategoryAllocationList.tsx).
  //
  // 🚨 뺄 수 있는 것은 선과 그 여백뿐이다. `mx-4`(클리퍼 되돌림)와 `pb-1.5`(포커스 링 하단
  // 여유)는 위 §짝 테스트가 지키는 잘림 방지 장치라 이 판에도 그대로 있어야 한다 — 완성된
  // 리터럴을 하나 더 두는 방식이라 한쪽만 고쳐도 조용히 갈릴 수 있다.
  it("divider=false 면 구분선만 빠지고 잘림 방지 짝은 그대로 남는다", () => {
    render(
      <DisclosurePanel id={PANEL_ID} open divider={false}>
        <input aria-label="금액" />
      </DisclosurePanel>,
    );

    expect(content()).not.toHaveClass("border-t");
    expect(content()).toHaveClass("mx-4", "pb-1.5");
    expect(panel()).toHaveClass("-mx-4");
  });
});
