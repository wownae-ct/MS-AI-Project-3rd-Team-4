// NumberInput 의 DOM 계약.
//
// 이 컴포넌트는 `<input type="number">` 를 대체한다(이유는 `shared/lib/number-input.ts` 머리말).
// 대체이므로 **네이티브가 주던 것을 잃지 않았다는 증거**가 필요하다 — 이 파일이 그 증거다.
// 스텝(↑↓·▲▼)·spinbutton 시맨틱·모바일 키패드는 잃으면 회귀이고, 문자 차단과 콤마는
// 새로 얻는 것이다. 두 방향을 같은 파일에서 고정한다.
//
// 순수 계산(정화·그룹핑·캐럿·스텝 산식)은 `shared/lib/number-input.test.ts` 가 이미 고정했다.
// 여기서는 "그 계산이 실제 DOM 에 연결돼 있는가"만 본다.
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberInput } from "./NumberInput";

const LABEL = "금액(원)";

/**
 * 제어 컴포넌트라 부모 없이는 아무 일도 일어나지 않는다 — 실제 사용처와 같은 모양으로 감싼다.
 * `onChange` 스파이는 부모가 **실제로 받은 값**을 본다(표시 문자열이 아니라 실값이 계약이다).
 */
function Harness({
  initial = null,
  onChange,
  step,
  min,
  max,
  placeholder,
}: {
  initial?: number | null;
  onChange?: (next: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <NumberInput
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      step={step}
      min={min}
      max={max}
      placeholder={placeholder}
      aria-label={LABEL}
    />
  );
}

function field(): HTMLInputElement {
  return screen.getByRole("spinbutton", { name: LABEL });
}

/** ▲(0번)·▼(1번). aria-hidden 이라 getByRole 로는 잡히지 않는다 — 네이티브 스피너와 같은 취급이다. */
function spinners(): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")];
}

afterEach(() => {
  vi.useRealTimers();
});

describe("NumberInput — 표시", () => {
  it("천 단위 콤마를 붙여 보여준다", () => {
    render(<Harness initial={45_000_000} />);

    expect(field().value).toBe("45,000,000");
  });

  it("세 자리 이하는 콤마가 없다", () => {
    render(<Harness initial={450} />);

    expect(field().value).toBe("450");
  });

  it("빈 값(null)은 빈 칸이다 — 0 이 대신 박히지 않는다", () => {
    render(<Harness initial={null} placeholder="금액(원)" />);

    expect(field().value).toBe("");
    expect(field().placeholder).toBe("금액(원)");
  });

  // 모바일 숫자 키패드는 `type="number"` 를 버리면서 잃을 뻔한 것 중 하나다.
  // inputMode 가 그것을 그대로 지킨다.
  it("모바일 숫자 키패드를 유지한다", () => {
    render(<Harness />);

    expect(field()).toHaveAttribute("inputmode", "numeric");
  });
});

describe("NumberInput — 숫자 외 입력 차단", () => {
  it("타이핑하면 콤마가 붙고 부모에는 콤마 없는 정수가 올라간다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(field(), "4500");

    expect(field().value).toBe("4,500");
    expect(onChange).toHaveBeenLastCalledWith(4500);
  });

  // `type="number"` 가 실제로 통과시키던 셋이다. 하나라도 들어가면 Number() 로 파싱하는
  // 소비자가 음수/지수 금액을 서버로 보낸다.
  it("마이너스·소수점·지수·한글은 한 글자도 들어가지 않는다", async () => {
    const user = userEvent.setup();
    render(<Harness initial={1000} />);

    await user.type(field(), "-.eE가");

    expect(field().value).toBe("1,000");
  });

  it("통화기호·콤마가 섞인 문자열을 붙여넣어도 숫자만 남는다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(field());
    await user.paste("₩1,234,567원");

    expect(field().value).toBe("1,234,567");
    expect(onChange).toHaveBeenLastCalledWith(1_234_567);
  });

  // Step8Allocation·CategoryAllocationRow 처럼 **부모가 빈 칸을 표현할 수 없는** 자리가 있다
  // (금액이 슬라이더와 상태를 공유해 늘 숫자여야 한다). 그런 부모는 null 을 0으로 되돌려 보내는데,
  // 그때 "0"이 즉시 박히면 두 가지가 깨진다: 지운 사람의 의도와 다르고, 이어서 "3"을 치면
  // 캐럿이 "0" 앞에 있어 **30** 이 된다(사용자가 원한 값은 3이다).
  it("부모가 빈 칸을 0으로 되돌려도 빈 칸을 유지하고, 이어서 친 숫자가 그대로 들어간다", async () => {
    const user = userEvent.setup();
    function CoercingHarness() {
      const [value, setValue] = useState<number>(4500);
      return (
        <NumberInput
          value={value}
          onValueChange={(next) => {
            setValue(next ?? 0);
          }}
          aria-label={LABEL}
        />
      );
    }
    render(<CoercingHarness />);

    await user.clear(field());
    expect(field().value).toBe("");

    await user.keyboard("3");
    expect(field().value).toBe("3");
  });

  it("전체 선택 후 삭제하면 빈 칸이 되고 부모는 null 을 받는다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={4500} onChange={onChange} />);

    await user.clear(field());

    expect(field().value).toBe("");
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe("NumberInput — 캐럿", () => {
  // 콤마가 끼어들면서 문자열이 길어지므로, 아무 처리도 안 하면 캐럿이 맨 끝으로 튄다.
  // 금액 중간을 고치는 흔한 동작이 그대로 망가지는 자리다.
  it("중간에 숫자를 끼워 넣어도 캐럿이 끝으로 튀지 않는다", async () => {
    const user = userEvent.setup();
    render(<Harness initial={4500} />);

    const input = field();
    await user.click(input);
    input.setSelectionRange(1, 1); // "4|,500"
    await user.keyboard("1");

    expect(input.value).toBe("41,500");
    expect(input.selectionStart).toBe(2); // "41|,500"
  });
});

describe("NumberInput — 스텝(네이티브 대체)", () => {
  it("↑ 는 다음 step 배수로 올린다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={7} step={10} onChange={onChange} />);

    await user.click(field());
    await user.keyboard("{ArrowUp}");

    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it("↓ 는 min 아래로 내려가지 않는다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={0} step={10} min={0} onChange={onChange} />);

    await user.click(field());
    await user.keyboard("{ArrowDown}");

    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("빈 칸에서 ↑ 는 max(min, step) — 네이티브와 같다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={null} step={10} min={0} onChange={onChange} />);

    await user.click(field());
    await user.keyboard("{ArrowUp}");

    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  // 네이티브에 없던 추가 기능 — 수백만원대를 스텝으로 옮길 때 10번 누르지 않게 한다.
  it("Shift+↑ 는 step 의 10배", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={0} step={10} onChange={onChange} />);

    await user.click(field());
    await user.keyboard("{Shift>}{ArrowUp}{/Shift}");

    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it("max 위로는 올라가지 않는다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={95} step={10} min={0} max={100} onChange={onChange} />);

    await user.click(field());
    await user.keyboard("{ArrowUp}");

    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it("▲ 를 클릭하면 한 칸 오른다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={0} step={10} onChange={onChange} />);

    await user.click(spinners()[0]);

    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it("▼ 를 클릭하면 한 칸 내린다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={30} step={10} onChange={onChange} />);

    await user.click(spinners()[1]);

    expect(onChange).toHaveBeenLastCalledWith(20);
  });

  // 네이티브 스피너는 꾹 누르면 반복한다. 그 감각까지 맞춰야 "대체"다.
  it("▲ 를 길게 누르면 반복해서 오른다", () => {
    vi.useFakeTimers();
    render(<Harness initial={0} step={10} />);

    fireEvent.pointerDown(spinners()[0]);
    // act 로 감싸야 타이머가 부른 setState 가 실제로 커밋된다 — 감싸지 않으면 틱은 돌지만
    // 화면(=이 테스트가 읽는 DOM)에 반영되지 않아 "반복이 안 된다"고 잘못 읽힌다.
    act(() => {
      vi.advanceTimersByTime(1000); // 400ms 지연 + 60ms 간격 → 10회 이상
    });
    fireEvent.pointerUp(window);

    // 정확한 횟수는 타이밍 상수에 묶이므로 고정하지 않는다 — "한 번 이상 더 올랐다"만 본다.
    expect(Number(field().value.replaceAll(",", ""))).toBeGreaterThan(10);
  });

  it("길게 누른 채 언마운트해도 타이머가 남지 않는다", () => {
    vi.useFakeTimers();
    const { unmount } = render(<Harness initial={0} step={10} />);

    fireEvent.pointerDown(spinners()[0]);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    unmount();

    // 정리에 실패하면 언마운트된 컴포넌트의 setState 가 계속 돌아 경고/누수가 된다.
    expect(() => {
      vi.advanceTimersByTime(1000);
    }).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  // step 이 없는 필드는 스텝 개념 자체가 없다 — 버튼을 그리면 눌러도 아무 일이 없는 장식이 된다.
  it("step 을 주지 않으면 스피너를 그리지 않는다", () => {
    render(<Harness initial={0} />);

    expect(spinners()).toHaveLength(0);
  });
});

describe("NumberInput — 접근성", () => {
  // `type="number"` 는 암묵적으로 spinbutton 역할이었다. 텍스트 입력으로 바꾸면서
  // 그 역할을 명시하지 않으면 스크린리더가 현재값·범위를 잃는다.
  it("spinbutton 역할과 현재값·범위를 노출한다", () => {
    render(<Harness initial={4500} step={10} min={0} max={10_000} />);

    const input = field();
    expect(input).toHaveAttribute("aria-valuenow", "4500");
    expect(input).toHaveAttribute("aria-valuemin", "0");
    expect(input).toHaveAttribute("aria-valuemax", "10000");
    // 숫자만 읽으면 "사천오백"인지 자릿수가 흐려진다 — 표시와 같은 콤마 형태로도 준다.
    expect(input).toHaveAttribute("aria-valuetext", "4,500");
  });

  it("빈 칸이면 aria-valuenow 를 붙이지 않는다 — 0 이라고 거짓말하지 않는다", () => {
    render(<Harness initial={null} step={10} />);

    expect(field()).not.toHaveAttribute("aria-valuenow");
  });

  // 네이티브 스피너 버튼도 탭 순서에 들어가지 않고 AT 에 별도 노드로 노출되지 않는다.
  // 기능은 spinbutton 인 입력이 이미 노출하므로, 버튼이 또 나오면 중복 낭독이 된다.
  it("스피너 버튼은 탭 순서와 접근성 트리에서 빠진다", () => {
    render(<Harness initial={0} step={10} />);

    for (const button of spinners()) {
      expect(button).toHaveAttribute("tabindex", "-1");
      expect(button).toHaveAttribute("aria-hidden", "true");
    }
  });
});
