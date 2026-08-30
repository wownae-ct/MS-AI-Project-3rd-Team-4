// DateCalendar 의 DOM 계약 — 그리드·월 이동·빠른 선택·기준일 표시.
//
// `DateField.test.tsx` 는 "필드에서 열어 고르는" 경로를 보고, 이 파일은 패널 안쪽을 직접 본다
// (lazy 경계를 건너뛰므로 월 이동처럼 클릭이 여러 번 필요한 검사가 빠르고 읽기 쉽다).
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MONTH_GRID_LENGTH, todayISO } from "@/shared/lib/date";
import { DateCalendar } from "./DateCalendar";

function renderCalendar(overrides: Partial<React.ComponentProps<typeof DateCalendar>> = {}) {
  const props = {
    value: "2026-11-02",
    onSelect: vi.fn(),
    onClose: vi.fn(),
    labelId: "month-label",
    ...overrides,
  };
  const { unmount } = render(<DateCalendar {...props} />);
  return { ...props, unmount };
}

function grid(): HTMLElement {
  return screen.getByRole("table");
}

/** 날짜 셀만 — 요일 헤더(`th`)와 ‹ › · 지우기 · 닫기 버튼은 뺀다. */
function dayCells(): HTMLElement[] {
  return within(grid()).getAllByRole("button");
}

describe("DateCalendar — 그리드", () => {
  it("어느 달이든 6주 42칸이다(달마다 패널 높이가 출렁이지 않는다)", () => {
    const { unmount } = renderCalendar({ value: "2026-02-10" });
    expect(dayCells()).toHaveLength(MONTH_GRID_LENGTH);
    unmount();
    renderCalendar({ value: "2026-08-10" });
    expect(dayCells()).toHaveLength(MONTH_GRID_LENGTH);
  });

  it("요일 헤더가 일요일부터 시작한다", () => {
    renderCalendar();
    const headers = within(grid()).getAllByRole("columnheader");
    expect(headers.map((cell) => cell.textContent)).toEqual(["일", "월", "화", "수", "목", "금", "토"]);
  });

  it("셀은 날짜·요일을 이름으로 읽어 준다 — 숫자만 읽으면 무슨 15일인지 알 수 없다", () => {
    renderCalendar();
    expect(screen.getByRole("button", { name: "2026년 11월 20일 (금)" })).toBeInTheDocument();
  });

  it("선택된 날짜는 이름에 그 사실이 실린다", () => {
    renderCalendar({ value: "2026-11-02" });
    expect(screen.getByRole("button", { name: /2026년 11월 2일.*선택됨/u })).toBeInTheDocument();
  });

  it("오늘은 aria-current 로 표시된다", () => {
    renderCalendar({ value: todayISO() });
    expect(screen.getByRole("button", { name: /오늘/u })).toHaveAttribute("aria-current", "date");
  });

  it("탭 순서에 들어가는 셀은 하나뿐이다(로빙 탭인덱스) — 42칸을 Tab 으로 지나가지 않는다", () => {
    renderCalendar();
    expect(dayCells().filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
  });
});

describe("DateCalendar — 월 이동", () => {
  it("‹ › 로 앞뒤 달을 오간다", async () => {
    const user = userEvent.setup();
    renderCalendar({ value: "2026-11-02" });
    await user.click(screen.getByRole("button", { name: "다음 달" }));
    expect(screen.getByRole("button", { name: /2026년 12월 25일/u })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "이전 달" }));
    await user.click(screen.getByRole("button", { name: "이전 달" }));
    expect(screen.getByRole("button", { name: /2026년 10월 15일/u })).toBeInTheDocument();
  });

  it("연·월 셀렉트로 멀리 건너뛴다 — 결혼식 날짜를 고르는 주 경로다", async () => {
    const user = userEvent.setup();
    renderCalendar({ value: "2026-11-02" });
    // [D22] `selectOptions` 를 쓰지 않는다 — 이 컨트롤은 이제 네이티브 `<select>` 가 아니라
    // 자체 목록이다(`shared/ui/Select.tsx`). 열고 고르는 **사용자가 실제로 하는 동작**을 태운다.
    await user.click(screen.getByRole("combobox", { name: "연도" }));
    await user.click(screen.getByRole("option", { name: "2027년" }));
    await user.click(screen.getByRole("combobox", { name: "월" }));
    await user.click(screen.getByRole("option", { name: "5월" }));
    expect(screen.getByRole("button", { name: "2027년 5월 15일 (토)" })).toBeInTheDocument();
  });

  it("보이는 달을 live region 이 알린다", async () => {
    const user = userEvent.setup();
    renderCalendar({ value: "2026-11-02" });
    await user.click(screen.getByRole("button", { name: "다음 달" }));
    expect(screen.getByRole("status")).toHaveTextContent("2026년 12월");
  });

  // 날짜를 골라도 패널이 닫히지 않게 되면서(2026-08-30) 필요해진 계약이다 — 6주 그리드에는
  // 앞뒤 달의 날이 함께 보이는데, 그 하나를 고르고도 11월에 머물면 방금 고른 칸이 「지난달 칸」
  // 자리에 남는다. 종전엔 곧바로 닫혀서 드러나지 않던 자리다.
  it("앞뒤 달의 날을 고르면 보이는 달이 그 값을 따라간다", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DateCalendar value="2026-11-02" onSelect={vi.fn()} onClose={vi.fn()} labelId="l" />);
    // 2026-11 그리드의 마지막 줄에는 12월 초가 딸려 온다.
    await user.click(screen.getByRole("button", { name: /^2026년 12월 1일/u }));
    rerender(<DateCalendar value="2026-12-01" onSelect={vi.fn()} onClose={vi.fn()} labelId="l" />);
    expect(screen.getByRole("status")).toHaveTextContent("2026년 12월");
  });

  it("범위 밖으로는 이동 버튼이 잠긴다 — 눌러도 제자리인 버튼을 남기지 않는다", () => {
    renderCalendar({ value: "2026-11-02", min: "2026-11-01", max: "2026-11-30" });
    expect(screen.getByRole("button", { name: "이전 달" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "다음 달" })).toBeDisabled();
  });
});

describe("DateCalendar — 빠른 선택", () => {
  // [2026-08-30] 종전엔 「곧바로 정해지고 **닫힌다**」였다. 이제 닫는 길은 「닫기」·Esc·바깥
  // 누르기뿐이다 — 「6개월 뒤」가 며칠인지는 눌러 봐야 알고, 그 확인이 그리드에서 이뤄져야 한다.
  it("칩을 누르면 그 날짜로 정해지되 닫히지는 않는다", async () => {
    const user = userEvent.setup();
    const props = renderCalendar({
      value: "2026-11-02",
      quickPicks: [{ label: "6개월 뒤", value: "2027-05-02" }],
    });
    await user.click(screen.getByRole("button", { name: "6개월 뒤" }));
    expect(props.onSelect).toHaveBeenCalledWith("2027-05-02");
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("범위 밖 칩은 아예 그리지 않는다", () => {
    renderCalendar({
      value: "2026-11-02",
      min: "2026-11-05",
      quickPicks: [
        { label: "오늘", value: "2026-11-02" },
        { label: "1주 뒤", value: "2026-11-09" },
      ],
    });
    expect(screen.queryByRole("button", { name: "오늘" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1주 뒤" })).toBeInTheDocument();
  });
});

describe("DateCalendar — 기준일 표시", () => {
  it("표시할 날짜를 이름에 함께 실어 준다(타임라인의 결혼식 날짜)", () => {
    renderCalendar({ value: "2026-11-02", markedDate: "2026-11-21", markedLabel: "결혼식 날짜" });
    expect(screen.getByRole("button", { name: /2026년 11월 21일.*결혼식 날짜/u })).toBeInTheDocument();
  });
});

describe("DateCalendar — 닫기", () => {
  it("「닫기」와 Esc 가 같은 일을 한다", async () => {
    const user = userEvent.setup();
    const props = renderCalendar();
    await user.click(screen.getByRole("button", { name: "닫기" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("「지우기」는 onClear 를 준 경우에만 뜬다", () => {
    const { unmount } = renderCalendar({ value: "2026-11-02" });
    expect(screen.queryByRole("button", { name: "지우기" })).not.toBeInTheDocument();
    unmount();
    renderCalendar({ value: "2026-11-02", onClear: vi.fn() });
    expect(screen.getByRole("button", { name: "지우기" })).toBeInTheDocument();
  });

  it("값이 없으면 지울 것도 없다", () => {
    renderCalendar({ value: "", onClear: vi.fn() });
    expect(screen.queryByRole("button", { name: "지우기" })).not.toBeInTheDocument();
  });
});
