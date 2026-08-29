// 드롭다운의 계약(D22). 네이티브 `<select>` 를 대체했으므로 **네이티브가 주던 것을 여기서
// 하나씩 고정한다** — `NumberInput.test`·`DateCalendar.test` 가 같은 일을 한다.
//
// 특히 키보드는 눈으로 볼 수 없어 회귀가 조용히 난다. APG 「Select-Only Combobox」의 계약
// (↑↓ · Home/End · Enter/Space · Esc · Tab · 타이핑 점프)을 전부 여기서 붙잡는다.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select } from "./Select";

const OPTIONS = [
  { value: "TODO", label: "할 일" },
  { value: "DOING", label: "진행 중" },
  { value: "DONE", label: "완료" },
];

function trigger() {
  return screen.getByRole("combobox", { name: "상태" });
}

function renderSelect(props: Partial<Parameters<typeof Select>[0]> = {}) {
  const onValueChange = vi.fn();
  render(
    <Select value="TODO" onValueChange={onValueChange} options={OPTIONS} aria-label="상태" {...props} />,
  );
  return onValueChange;
}

describe("Select", () => {
  it("닫혀 있으면 선택값만 보이고 목록은 없다", () => {
    renderSelect();
    expect(trigger()).toHaveTextContent("할 일");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("눌러서 열고, 항목을 누르면 그 값을 돌려주고 닫힌다", async () => {
    const onValueChange = renderSelect();
    await userEvent.click(trigger());

    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("option").map((el) => el.textContent)).toEqual(["할 일", "진행 중", "완료"]);

    await userEvent.click(screen.getByRole("option", { name: "진행 중" }));
    expect(onValueChange).toHaveBeenCalledWith("DOING");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("선택된 항목을 aria-selected 로 낸다 — 색만으로 전달하지 않는다(WCAG 1.4.1)", async () => {
    renderSelect();
    await userEvent.click(trigger());
    expect(screen.getByRole("option", { name: "할 일" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "진행 중" })).toHaveAttribute("aria-selected", "false");
  });

  describe("키보드 — APG Select-Only Combobox", () => {
    it("↓ 로 열고 ↓↑ 로 활성 항목을 옮긴 뒤 Enter 로 고른다", async () => {
      const onValueChange = renderSelect();
      trigger().focus();

      await userEvent.keyboard("{ArrowDown}"); // 열림 — 활성은 현재 값(할 일)
      await userEvent.keyboard("{ArrowDown}"); // 진행 중
      await userEvent.keyboard("{ArrowDown}"); // 완료
      await userEvent.keyboard("{ArrowUp}"); // 진행 중
      await userEvent.keyboard("{Enter}");

      expect(onValueChange).toHaveBeenCalledWith("DOING");
    });

    it("활성 항목을 aria-activedescendant 로 가리킨다 — 포커스는 트리거에 머문다", async () => {
      renderSelect();
      trigger().focus();
      await userEvent.keyboard("{ArrowDown}{ArrowDown}");

      const active = screen.getByRole("option", { name: "진행 중" });
      expect(trigger()).toHaveAttribute("aria-activedescendant", active.id);
      expect(trigger()).toHaveFocus();
    });

    it("Home/End 가 처음·끝으로 간다", async () => {
      const onValueChange = renderSelect();
      trigger().focus();
      await userEvent.keyboard("{ArrowDown}{End}{Enter}");
      expect(onValueChange).toHaveBeenCalledWith("DONE");
    });

    it("Esc 는 값을 바꾸지 않고 닫는다", async () => {
      const onValueChange = renderSelect();
      trigger().focus();
      await userEvent.keyboard("{ArrowDown}{ArrowDown}{Escape}");

      expect(screen.queryByRole("listbox")).toBeNull();
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it("Tab 은 활성 항목을 확정하고 포커스를 넘긴다", async () => {
      const onValueChange = renderSelect();
      trigger().focus();
      await userEvent.keyboard("{ArrowDown}{ArrowDown}");
      await userEvent.tab();

      expect(onValueChange).toHaveBeenCalledWith("DOING");
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("닫힌 채로 글자를 치면 열지 않고 값만 바꾼다 — 네이티브와 같다", async () => {
      const onValueChange = renderSelect();
      trigger().focus();
      await userEvent.keyboard("완");

      expect(onValueChange).toHaveBeenCalledWith("DONE");
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  it("바깥을 누르면 값을 바꾸지 않고 닫힌다", async () => {
    const onValueChange = renderSelect();
    await userEvent.click(trigger());
    await userEvent.click(document.body);

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("옵션에 없는 값이 와도 빈 칸을 그리지 않는다", () => {
    renderSelect({ value: "UNKNOWN" });
    expect(trigger()).toHaveTextContent("UNKNOWN");
  });

  it("<label htmlFor> 로 이름을 얻는다 — 라벨을 눌러도 열린다", async () => {
    render(
      <>
        <label htmlFor="s">항목 유형</label>
        <Select id="s" value="TODO" onValueChange={() => {}} options={OPTIONS} />
      </>,
    );
    const control = screen.getByRole("combobox", { name: "항목 유형" });
    await userEvent.click(screen.getByText("항목 유형"));
    expect(control).toHaveAttribute("aria-expanded", "true");
  });

  it("보이는 크기가 변이에 따라 갈린다 — field 16px · compact 14px", () => {
    const { unmount } = render(
      <Select value="TODO" onValueChange={() => {}} options={OPTIONS} aria-label="상태" />,
    );
    expect(trigger()).toHaveClass("text-base");
    unmount();

    renderSelect({ size: "compact" });
    expect(trigger()).toHaveClass("text-sm");
  });
});
