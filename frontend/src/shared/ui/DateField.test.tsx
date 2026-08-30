// DateField 의 DOM 계약.
//
// 이 컴포넌트는 `<input type="date">` 를 대체한다(이유는 그 파일 머리말). 대체이므로
// **네이티브가 주던 것을 잃지 않았다는 증거**가 필요하다 — 임의 연월 도달 · ↑↓ 증감 · min/max ·
// 지우기가 그것이고, 남은 날수 힌트와 범위 안내는 새로 얻는 것이다.
//
// [2026-08-30] 타이핑 경로가 사라졌다. 그래서 「마스크」·「초안 되돌리기」·「없는 날짜 오타」
// 세 묶음이 빠지고, 그 자리에 **타이핑이 하던 일을 캘린더가 대신한다는 증거**(연·월 드롭다운으로
// 임의 연월 도달 · 빠른 선택)가 들어왔다. 아래 「닫기 판정」은 그 개정과 함께 고친 모바일 결함의
// 회귀 테스트다.
//
// ⚠️ **패널은 닫혀도 DOM 에 남는다**(닫힘 전환을 위해). 그래서 "닫혔다"를 존재 여부로 볼 수 없다 —
// `aria-expanded` 와 `inert` 로 본다. 이 파일의 `expectClosed` 가 그 판정의 단일 출처다.
//
// ⚠️ **오늘 날짜를 고정하지 않는다.** 시스템 시각을 얼리면 `React.lazy` + `Suspense` 가 쓰는
// 마이크로태스크와 userEvent 의 타이머가 얽힌다. 대신 기대값을 같은 라이브러리 함수로 만들어
// 어느 날에 돌려도 성립하게 뒀다(그 함수들은 `date.test.ts` 가 독립적으로 검증한다).
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDays, formatKorean, todayISO } from "@/shared/lib/date";
import { DateField } from "./DateField";

const LABEL = "결제일";
const OUTSIDE = "바깥";

function Harness({
  initial = "",
  onChange,
  min,
  max,
  clearable,
  disabled,
  quickPicks,
}: {
  initial?: string;
  onChange?: (next: string) => void;
  min?: string;
  max?: string;
  clearable?: boolean;
  disabled?: boolean;
  quickPicks?: { label: string; value: string }[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
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
        quickPicks={quickPicks}
        aria-label={LABEL}
      />
      {/* 「바깥을 눌렀다」와 「바깥으로 Tab 했다」를 가르기 위한 두 표적. 포커스를 받지 않는
          자리(div)와 받는 자리(button)가 서로 다른 경로를 태운다. */}
      <div data-testid={OUTSIDE}>바깥</div>
      <button type="button">바깥 버튼</button>
    </>
  );
}

/** 값을 이고 다니는 트리거. 접근명이 `"결제일, 2026년 11월 2일 (월)"` 꼴이다. */
function trigger(): HTMLButtonElement {
  return screen.getByRole("button", { name: new RegExp(`^${LABEL},`, "u") });
}

function toggle(): HTMLButtonElement {
  return screen.getByRole("button", { name: /달력/u });
}

/** 패널을 감싼 클리퍼 — 트리거가 `aria-controls` 로 가리키는 그것. */
function panel(): HTMLElement {
  const id = trigger().getAttribute("aria-controls");
  const node = id === null ? null : document.querySelector<HTMLElement>(`[id="${id}"]`);
  if (node === null) throw new Error("패널이 아직 DOM 에 없다");
  return node;
}

function expectOpen() {
  expect(trigger()).toHaveAttribute("aria-expanded", "true");
  expect(panel().firstElementChild).not.toHaveAttribute("inert");
}

function expectClosed() {
  expect(trigger()).toHaveAttribute("aria-expanded", "false");
  expect(panel().firstElementChild).toHaveAttribute("inert");
}

describe("DateField — 값의 표현", () => {
  it("값을 사람이 읽는 서식으로 낸다 — 요일이 곧 의미인 필드라 요일까지 함께 낸다", () => {
    render(<Harness initial="2027-05-15" />);
    expect(trigger()).toHaveTextContent("2027년 5월 15일 (토)");
    expect(trigger()).toHaveAccessibleName(`${LABEL}, 2027년 5월 15일 (토)`);
  });

  it("빈 값이면 서식이 아니라 할 일을 적고, 힌트 줄은 아무 말도 하지 않는다", () => {
    render(<Harness />);
    expect(trigger()).toHaveTextContent("날짜 선택");
    expect(trigger()).not.toHaveAttribute("aria-describedby");
  });

  it("🚨 직접 칠 수 있는 칸이 아예 없다 — 값을 만드는 길은 캘린더뿐이다", () => {
    render(<Harness initial="2026-11-02" />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("DateField — 힌트 줄(네이티브가 못 보여주던 것)", () => {
  it("오늘·내일·어제는 숫자 대신 말로 낸다", () => {
    const { unmount } = render(<Harness initial={todayISO()} />);
    expect(screen.getByText("오늘")).toBeInTheDocument();
    unmount();
    render(<Harness initial={addDays(todayISO(), 1)} />);
    expect(screen.getByText("내일")).toBeInTheDocument();
  });

  it("먼 미래는 남은 날수로 낸다", () => {
    render(<Harness initial={addDays(todayISO(), 30)} />);
    expect(screen.getByText("30일 뒤")).toBeInTheDocument();
  });
});

describe("DateField — 범위 밖 값을 그 자리에서 말한다", () => {
  // 캘린더가 범위 밖 셀을 잠그므로 사용자가 만들 수는 없다. 남은 경로는 **밖에서 들어오는 것**
  // 하나다 — 결제 행에서 「이미 결제했어요」를 켜면 max 가 오늘로 바뀌고, 그 전에 들어 있던
  // 미래의 예정일이 그 순간 범위 밖이 된다.
  it("어디부터·어디까지 고를 수 있는지 알린다", () => {
    const { unmount } = render(<Harness initial="2026-08-01" min="2026-09-01" />);
    expect(screen.getByText(/2026년 9월 1일.*이후로 골라 주세요/u)).toBeInTheDocument();
    unmount();
    render(<Harness initial="2026-10-02" max="2026-09-01" />);
    expect(screen.getByText(/2026년 9월 1일.*이전으로 골라 주세요/u)).toBeInTheDocument();
  });
});

describe("DateField — 키보드(네이티브 세그먼트 증감을 갚는다)", () => {
  it("↑↓ 는 하루씩 옮긴다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    trigger().focus();
    await user.keyboard("{ArrowUp}");
    expect(trigger()).toHaveTextContent(formatKorean("2026-11-03"));
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(trigger()).toHaveTextContent(formatKorean("2026-11-01"));
  });

  it("PageUp/PageDown 은 한 달씩 옮긴다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    trigger().focus();
    await user.keyboard("{PageUp}");
    expect(trigger()).toHaveTextContent(formatKorean("2026-12-02"));
    await user.keyboard("{PageDown}{PageDown}");
    expect(trigger()).toHaveTextContent(formatKorean("2026-10-02"));
  });

  it("증감도 범위를 넘지 않는다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" max="2026-11-02" />);
    trigger().focus();
    await user.keyboard("{ArrowUp}");
    expect(trigger()).toHaveTextContent(formatKorean("2026-11-02"));
  });

  it("Alt+↓ 로 캘린더를 연다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    trigger().focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await screen.findByRole("button", { name: "닫기" });
    expectOpen();
  });
});

describe("DateField — 캘린더 패널", () => {
  // 달력 버튼으로 여는 경로는 아래 검사들이 전부 태운다. 여기서는 **칸 자체가 트리거가 됐다**는
  // 새 사실만 본다 — 종전엔 칸을 눌러도 캘린더가 열리지 않았다.
  // 첫 줄은 덤이다: 열기 전에는 `aria-controls` 가 가리킬 패널이 아예 없다(그 청크를 안 받았다).
  it("트리거를 눌러도 열린다 — 그전까지는 패널이 DOM 에 없다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    expect(trigger()).not.toHaveAttribute("aria-controls");
    await user.click(trigger());
    await screen.findByRole("button", { name: "닫기" });
    expectOpen();
  });

  // 🚨 [2026-08-30] 종전엔 「고르면 **닫힌다**」였다. 즉시 닫히면 잘못 누른 날을 고치려고 다시
  // 열어야 하고, 골랐다는 사실을 그리드에서 확인할 틈도 없다. 이제 닫는 것은 사용자가 정한다.
  it("날짜를 골라도 닫히지 않고, 「닫기」로 닫는다 — 부모로 올라가는 값은 여전히 ISO 다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="2026-11-02" onChange={onChange} />);
    await user.click(toggle());
    await user.click(await screen.findByRole("button", { name: /^2026년 11월 20일/u }));
    expect(trigger()).toHaveTextContent(formatKorean("2026-11-20"));
    expect(onChange).toHaveBeenCalledWith("2026-11-20"); // 화면은 한국어, 계약은 ISO
    expectOpen();
    await user.click(screen.getByRole("button", { name: "닫기" }));
    expectClosed();
  });

  it("연·월 드롭다운으로 임의의 연월에 닿는다 — 타이핑이 하던 일을 여기서 갚는다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    await user.click(toggle());
    await user.click(await screen.findByRole("combobox", { name: "연도" }));
    await user.click(screen.getByRole("option", { name: "2027년" }));
    await user.click(screen.getByRole("combobox", { name: "월" }));
    await user.click(screen.getByRole("option", { name: "5월" }));
    await user.click(screen.getByRole("button", { name: "2027년 5월 15일 (토)" }));
    expect(trigger()).toHaveTextContent("2027년 5월 15일 (토)");
  });

  it("빠른 선택 칩이 오늘 기준 계산을 대신한다", async () => {
    const user = userEvent.setup();
    const next = addDays(todayISO(), 7);
    render(<Harness quickPicks={[{ label: "1주 뒤", value: next }]} />);
    await user.click(toggle());
    await user.click(await screen.findByRole("button", { name: "1주 뒤" }));
    expect(trigger()).toHaveTextContent(formatKorean(next));
  });

  it("범위 밖 날짜는 누를 수 없다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-10" min="2026-11-05" />);
    await user.click(toggle());
    expect(await screen.findByRole("button", { name: /^2026년 11월 4일/u })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^2026년 11월 5일/u })).toBeEnabled();
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
    expect(trigger()).toHaveTextContent("날짜 선택");
    expectOpen(); // 비운 뒤 곧바로 다시 고르는 것이 이 버튼을 누르는 흔한 이유다
  });

  it("방향키로 셀 사이를 옮기고 Enter 로 고른다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    await user.click(toggle());
    await screen.findByRole("button", { name: /^2026년 11월 2일/u });
    await user.keyboard("{ArrowRight}{ArrowDown}{Enter}");
    expect(trigger()).toHaveTextContent(formatKorean("2026-11-10"));
  });

  it("다시 열면 지난번 둘러보던 달이 아니라 값의 달로 돌아온다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    await user.click(toggle());
    await user.click(await screen.findByRole("button", { name: "다음 달" }));
    expect(screen.getByRole("status")).toHaveTextContent("2026년 12월");

    await user.click(screen.getByRole("button", { name: "닫기" }));
    await user.click(toggle());
    expect(screen.getByRole("status")).toHaveTextContent("2026년 11월");
  });
});

describe("DateField — 닫기 판정", () => {
  it("Esc 로 닫는다", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    await user.click(toggle());
    await screen.findByRole("button", { name: "닫기" });
    await user.keyboard("{Escape}");
    expectClosed();
  });

  it("상자 밖을 누르면 닫힌다 — 포커스를 받지 않는 자리를 눌러도", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    await user.click(toggle());
    await screen.findByRole("button", { name: "닫기" });
    await user.click(screen.getByTestId(OUTSIDE));
    expectClosed();
  });

  it("포커스가 상자 밖 요소로 가면 닫힌다 — Tab 으로 빠져나가는 경로", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    await user.click(toggle());
    await screen.findByRole("button", { name: "닫기" });
    await user.click(screen.getByRole("button", { name: "바깥 버튼" }));
    expectClosed();
  });

  it("🚨 어디로 갔는지 모르는 포커스 이탈로는 닫지 않는다 — 모바일에서 달력을 못 쓰게 하던 결함", async () => {
    // iOS·macOS Safari 는 **탭으로 `<button>` 에 포커스를 주지 않는다.** 그래서 ‹ · 연·월 · ›
    // 를 터치하면 그리드 셀이 relatedTarget 없이 포커스를 잃었고, 종전 판정이 그 순간 패널을
    // 떼어 버려 click 이 도착할 요소가 없었다.
    // userEvent 는 언제나 버튼에 포커스를 주므로 그 환경을 재현하지 못한다 — 이탈 이벤트를
    // 직접 쏘고, 그 뒤 「이전 달」이 실제로 듣는지까지 본다.
    const user = userEvent.setup();
    render(<Harness initial="2026-11-02" />);
    await user.click(toggle());
    const cell = await screen.findByRole("button", { name: /^2026년 11월 2일/u });

    fireEvent.focusOut(cell, { relatedTarget: null });

    expectOpen();
    await user.click(screen.getByRole("button", { name: "이전 달" }));
    expect(screen.getByRole("status")).toHaveTextContent("2026년 10월");
    expectOpen();
  });
});

describe("DateField — 비활성", () => {
  it("트리거와 달력 버튼이 함께 잠긴다", () => {
    render(<Harness initial="2026-11-02" disabled />);
    expect(trigger()).toBeDisabled();
    expect(toggle()).toBeDisabled();
  });
});
