// DateField 의 DOM 계약.
//
// 이 컴포넌트는 `<input type="date">` 를 대체한다(이유는 그 파일 머리말). 대체이므로
// **네이티브가 주던 것을 잃지 않았다는 증거**가 필요하다 — 타이핑 · ↑↓ 증감 · min/max · 지우기가
// 그것이고, 요일·상대일 힌트와 범위 안내는 새로 얻는 것이다. 두 방향을 같은 파일에서 고정한다.
//
// 순수 계산(마스크·캐럿·달력 산술)은 `shared/lib/date-input.test.ts` 와 `date.test.ts` 가 이미
// 고정했다. 여기서는 "그 계산이 실제 DOM 에 연결돼 있는가"만 본다.
//
// ⚠️ **오늘 날짜를 고정하지 않는다.** 시스템 시각을 얼리면 `React.lazy` + `Suspense` 가 쓰는
// 마이크로태스크와 userEvent 의 타이머가 얽힌다. 대신 기대값을 같은 라이브러리 함수로 만들어
// 어느 날에 돌려도 성립하게 뒀다(그 함수들은 위 두 파일이 독립적으로 검증한다).
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDays, todayISO } from "@/shared/lib/date";
import { DateField } from "./DateField";

const LABEL = "결제일";

function Harness({
  initial = "",
  onChange,
  min,
  max,
  clearable,
  disabled,
}: {
  initial?: string;
  onChange?: (next: string) => void;
  min?: string;
  max?: string;
  clearable?: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DateField
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      min={min}
      max={max}
      clearable={clearable}
      disabled={disabled}
      aria-label={LABEL}
    />
  );
}

function field(): HTMLInputElement {
  return screen.getByRole("textbox", { name: LABEL });
}

function toggle(): HTMLButtonElement {
  return screen.getByRole("button", { name: /달력/u });
}

describe("DateField — 값의 표현", () => {
  it("입력칸의 value 는 ISO 문자열 그대로다(네이티브와 같은 계약 · 기존 호출부·테스트가 이것에 기댄다)", () => {
    render(<Harness initial="2026-11-02" />);
    expect(field()).toHaveValue("2026-11-02");
  });

  it("모바일 숫자 키패드를 부른다 — 네이티브 피커를 잃은 대가를 갚는 지점이다", () => {
    render(<Harness />);
    expect(field()).toHaveAttribute("inputMode", "numeric");
  });

  it("빈 값이면 서식을 자리표시로 알린다", () => {
    render(<Harness />);
    expect(field()).toHaveAttribute("placeholder", "YYYY-MM-DD");
  });
});

describe("DateField — 타이핑(마스크)", () => {
  it("숫자만 쳐도 구분자가 알아서 끼어든다", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "20261102");
    expect(field()).toHaveValue("2026-11-02");
  });

  it("8자리를 채웠을 때만 부모로 값을 올린다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(field(), "2026110");
    expect(onChange).not.toHaveBeenCalled();
    await user.type(field(), "2");
    expect(onChange).toHaveBeenCalledWith("2026-11-02");
  });

  it("숫자가 아닌 문자는 아예 들어오지 않는다", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "20a26-b11");
    expect(field()).toHaveValue("2026-11");
  });

  it("칸을 비우면 부모도 빈 값을 받는다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="2026-11-02" onChange={onChange} />);
    await user.clear(field());
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});

describe("DateField — 잘못된 입력을 그 자리에서 말한다", () => {
  it("달력에 없는 날은 문구로 알리고 값으로 올리지 않는다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(field(), "20260230");
    expect(screen.getByText("그런 날짜는 없어요. 다시 확인해 주세요.")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("min 보다 이른 날짜는 어디부터 고를 수 있는지 알린다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness min="2026-09-01" onChange={onChange} />);
    await user.type(field(), "20260801");
    expect(screen.getByText(/2026년 9월 1일.*이후로 골라 주세요/u)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("max 보다 늦은 날짜도 마찬가지다", async () => {
    const user = userEvent.setup();
    render(<Harness max="2026-09-01" />);
    await user.type(field(), "20261002");
    expect(screen.getByText(/2026년 9월 1일.*이전으로 골라 주세요/u)).toBeInTheDocument();
  });

  it("아직 다 치지 않은 값에는 아무 말도 하지 않는다 — 타이핑 중에 훈수 두지 않는다", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "2026");
    expect(screen.queryByText(/골라 주세요|없어요/u)).not.toBeInTheDocument();
  });

  it("칸을 떠나면 미완성 초안은 원래 값으로 되돌아간다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    await user.clear(field());
    await user.type(field(), "2027");
    await user.tab();
    expect(field()).toHaveValue("");
  });
});

describe("DateField — 힌트 줄(네이티브가 못 보여주던 것)", () => {
  it("요일과 상대 일수를 함께 낸다", () => {
    render(<Harness initial="2027-05-15" />);
    expect(screen.getByText(/2027년 5월 15일 \(토\)/u)).toBeInTheDocument();
  });

  it("오늘·내일·어제는 숫자 대신 말로 낸다", () => {
    const { unmount } = render(<Harness initial={todayISO()} />);
    expect(screen.getByText(/· 오늘$/u)).toBeInTheDocument();
    unmount();
    render(<Harness initial={addDays(todayISO(), 1)} />);
    expect(screen.getByText(/· 내일$/u)).toBeInTheDocument();
  });

  it("먼 미래는 남은 날수로 낸다", () => {
    render(<Harness initial={addDays(todayISO(), 30)} />);
    expect(screen.getByText(/· 30일 뒤$/u)).toBeInTheDocument();
  });
});

describe("DateField — 키보드(네이티브 세그먼트 증감을 갚는다)", () => {
  it("↑↓ 는 하루씩 옮긴다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    await user.click(field());
    await user.keyboard("{ArrowUp}");
    expect(field()).toHaveValue("2026-11-03");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(field()).toHaveValue("2026-11-01");
  });

  it("PageUp/PageDown 은 한 달씩 옮긴다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    await user.click(field());
    await user.keyboard("{PageUp}");
    expect(field()).toHaveValue("2026-12-02");
    await user.keyboard("{PageDown}{PageDown}");
    expect(field()).toHaveValue("2026-10-02");
  });

  it("증감도 범위를 넘지 않는다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" max="2026-11-02" />);
    await user.click(field());
    await user.keyboard("{ArrowUp}");
    expect(field()).toHaveValue("2026-11-02");
  });
});

describe("DateField — 캘린더 패널", () => {
  it("달력 버튼으로 열고 날짜를 고르면 값이 바뀌고 닫힌다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    await user.click(toggle());
    const day = await screen.findByRole("button", { name: /2026년 11월 20일/u });
    await user.click(day);
    expect(field()).toHaveValue("2026-11-20");
    expect(screen.queryByRole("button", { name: /2026년 11월 20일/u })).not.toBeInTheDocument();
  });

  it("범위 밖 날짜는 누를 수 없다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-10" min="2026-11-05" />);
    await user.click(toggle());
    expect(await screen.findByRole("button", { name: /2026년 11월 4일/u })).toBeDisabled();
    expect(screen.getByRole("button", { name: /2026년 11월 5일/u })).toBeEnabled();
  });

  it("clearable 일 때만 지우기가 있다", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness initial="2026-11-02" />);
    await user.click(toggle());
    await screen.findByRole("button", { name: "닫기" });
    expect(screen.queryByRole("button", { name: "지우기" })).not.toBeInTheDocument();
    unmount();

    render(<Harness initial="2026-11-02" clearable />);
    await user.click(toggle());
    await user.click(await screen.findByRole("button", { name: "지우기" }));
    expect(field()).toHaveValue("");
  });

  it("Esc 로 닫는다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    await user.click(toggle());
    await screen.findByRole("button", { name: "닫기" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "닫기" })).not.toBeInTheDocument();
  });

  it("방향키로 셀 사이를 옮기고 Enter 로 고른다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    await user.click(toggle());
    await screen.findByRole("button", { name: /2026년 11월 2일/u });
    await user.keyboard("{ArrowRight}{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(field()).toHaveValue("2026-11-10");
  });
});

describe("DateField — 비활성", () => {
  it("입력칸과 달력 버튼이 함께 잠긴다", () => {
    render(<Harness initial="2026-11-02" disabled />);
    expect(field()).toBeDisabled();
    expect(toggle()).toBeDisabled();
  });
});
