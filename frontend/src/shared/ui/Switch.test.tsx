// 온보딩 7단계에서 뽑아 올린 스위치의 계약(2026-08-29). 두 화면(온보딩 카테고리 on/off ·
// 예산 재배분의 사용 여부 패널)이 같은 결정을 그리므로, 승격이 **아무것도 잃지 않았다**는 것을
// 여기서 고정한다.
//
// 🚨 `h-6`(24px)은 취향이 아니라 WCAG 2.2 SC 2.5.8(AA) 최소 타겟 크기다 — 접근성 감사
// 2026-08-26 이전의 21px 가 그 최저선 아래였다. jsdom 은 CSS 를 계산하지 않아 눈으로는 확인할
// 수 없어 클래스 계약으로만 지킬 수 있다(DisclosurePanel.test.tsx 와 같은 처리).
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "./Switch";

function track() {
  return screen.getByRole("switch", { name: "예식장 카테고리 사용 여부" });
}

function renderSwitch(checked: boolean, onCheckedChange = vi.fn(), disabled?: boolean) {
  render(
    <Switch
      checked={checked}
      onCheckedChange={onCheckedChange}
      label="예식장 카테고리 사용 여부"
      disabled={disabled}
    />,
  );
  return onCheckedChange;
}

describe("Switch", () => {
  it("상태를 aria-checked 로 낸다 — 보이는 라벨이 없어 접근명이 유일한 단서다", () => {
    renderSwitch(true);
    expect(track()).toHaveAttribute("aria-checked", "true");
  });

  it("누르면 반대 값을 돌려준다", async () => {
    const onCheckedChange = renderSwitch(false);
    await userEvent.click(track());
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("최소 타겟 크기(24px)를 켜짐·꺼짐 양쪽에서 지킨다", () => {
    const { unmount } = render(
      <Switch checked onCheckedChange={() => {}} label="예식장 카테고리 사용 여부" />,
    );
    expect(track()).toHaveClass("h-6", "w-9");
    unmount();

    renderSwitch(false);
    expect(track()).toHaveClass("h-6", "w-9");
  });

  it("disabled 면 눌러도 값이 나가지 않는다", async () => {
    const onCheckedChange = renderSwitch(true, vi.fn(), true);
    await userEvent.click(track());
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
