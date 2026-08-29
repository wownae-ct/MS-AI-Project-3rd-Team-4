// 날짜 입력 — `<input type="date">` 를 대체한다. `NumberInput`(숫자) 의 날짜 쪽 짝이다.
//
// ## 왜 네이티브를 버렸는가
//
// ① **iOS Safari 는 연/월/일 3단 휠 피커를 연다.** 8개월 뒤 토요일을 고르려면 세 번 스크롤해야
//    하고, 「토요일이 며칠인지」는 그 피커가 알려주지 않는다. 결혼식 날짜·타임라인 항목처럼
//    **요일이 곧 의미인** 필드에 최악의 조합이다.
// ② **브라우저마다 다르다.** 표시 서식(2026-08-29 / 08/29/2026 / 2026. 8. 29.) · 지우기 수단 ·
//    달력 아이콘 위치가 전부 갈린다. 화면 표기를 우리가 정할 수 없다.
// ③ **범위를 강제할 수단이 실질적으로 없었다.** 호출부 어디에도 min/max 가 없어 `20266-08-29`
//    같은 오타가 그대로 통과해 제출 시점의 422 로만 드러났다.
//
// ## 잃는 것은 하나도 남기지 않고 갚는다 (NumberInput 머리말과 같은 규칙)
//
//   모바일 피커        → 인라인 월 그리드(`DateCalendar`, 셀 44px)
//   세그먼트 타이핑    → inputMode="numeric" + ISO 마스크(`shared/lib/date-input.ts`) + 캐럿 보존
//   ↑↓ 세그먼트 증감   → ↑↓ 하루 · PageUp/PageDown 한 달
//   min/max 클램프     → props + 범위 밖 셀 비활성 + 입력 시 안내 문구
//   지우기             → `clearable` 일 때 캘린더 안 「지우기」
//   로케일 표시        → 입력칸은 ISO 고정 + 아래 힌트 줄이 "2027년 5월 15일 (토) · 259일 뒤"
//   date 시맨틱        → textbox + aria-describedby(요일·상대일·범위 안내) + 캘린더는 표 시맨틱
//
// **값은 언제나 ISO `YYYY-MM-DD` 문자열이다** — 입력칸의 `value` 도 그렇다. 사람이 읽는 서식은
// 힌트 줄에만 산다. 덕분에 API 계약도, 이 필드를 쓰던 기존 테스트(`toHaveValue("2026-11-02")`)도
// 그대로다.
//
// ## 로컬 초안(`text`) 하나를 두는 이유
//
// `NumberInput` 은 "완전 제어 + 로컬 state 0개"를 원칙으로 삼았지만 날짜는 그럴 수 없다 —
// `2026-08-2` 처럼 **아직 값이 아닌 중간 상태**가 존재하기 때문이다. 대신 규칙을 좁게 못 박는다:
//   · 8자리를 채우고 실존하는 날짜이고 범위 안일 때만 부모로 올린다.
//   · 밖에서 `value` 가 바뀌면 초안을 버리고 따른다 — **단, 입력칸에 포커스가 있을 때는 아니다**
//     (타이핑 중에 되돌려 버리면 글자를 칠 수 없다).
//   · 칸을 떠날 때 미완성/무효 초안은 조용히 `value` 로 되돌린다.
import { lazy, Suspense, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, FocusEvent, KeyboardEvent } from "react";
import {
  addDays,
  addMonths,
  clampISO,
  diffDays,
  formatKorean,
  isValidISO,
  isWithinRange,
  todayISO,
  type DateQuickPick,
} from "@/shared/lib/date";
import {
  caretAfterDateFormat,
  formatDateDigits,
  isCompleteDateDigits,
  toDateDigits,
  unformatDate,
} from "@/shared/lib/date-input";
import { IconCalendar } from "./icons";
import { Loading } from "./Loading";

// 캘린더는 첫 열림 때 받는다 — 이 컴포넌트는 첫 화면(대시보드)을 통해 초기 청크에 들어가고,
// 그 청크의 바이트는 폰트 시작을 밀어 LCP 로 이어진다(`DateCalendar.tsx` 머리말 §번들).
const DateCalendar = lazy(() => import("./DateCalendar").then((mod) => ({ default: mod.DateCalendar })));

/**
 * 캘린더 청크를 미리 받아 둔다 — 필드에 포커스나 포인터가 닿는 순간 시작해 두면 실제로 열 때는
 * 이미 도착해 있다. 라우터의 `defaultPreload: "intent"`(app/router/router.tsx)와 같은 수법이다.
 * 동적 import 는 모듈 레지스트리에 캐시되므로 여러 번 불러도 요청은 한 번뿐이다.
 */
function preloadCalendar() {
  void import("./DateCalendar");
}

const WRAP = "flex flex-col gap-1";
const INPUT_ROW = "flex items-stretch gap-1";
const INPUT_BASE = "min-w-0 flex-1";
const TOGGLE_BUTTON =
  "flex h-tap w-tap flex-none items-center justify-center rounded-md border border-line bg-surface text-ink-soft " +
  "transition-colors duration-150 enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";
const HINT = "text-xs text-ink-soft";
const HINT_PROBLEM = "text-xs font-bold text-primary";
const PANEL_FALLBACK = "mt-2 h-72 rounded-md border border-line bg-surface";

const ISO_PLACEHOLDER = "YYYY-MM-DD";

export interface DateFieldProps {
  /** ISO `YYYY-MM-DD` 또는 빈 문자열. */
  value: string;
  onChange: (nextISO: string) => void;
  /** 필수 — 이 컴포넌트는 라벨을 스스로 그리지 않는다(NumberInput 과 같은 계약). */
  "aria-label": string;
  min?: string;
  max?: string;
  disabled?: boolean;
  /** 값을 비울 수 있는 칸(선택 입력)에만 준다 — 캘린더에 「지우기」가 생긴다. */
  clearable?: boolean;
  quickPicks?: readonly DateQuickPick[];
  /** 그리드에 기준선으로 표시할 날짜(지금은 결혼식 날짜). */
  markedDate?: string;
  markedLabel?: string;
  /** 입력칸 자체의 클래스 — 지금까지 각 화면이 `<input>` 에 직접 주던 그 값이다. */
  className?: string;
  /** 바깥 상자의 클래스(flex 부모 안에서의 배치 등). NumberInput 이 슬롯을 둘로 가른 것과 같은 이유. */
  wrapClassName?: string;
  /** 바깥 `<label htmlFor>` 와 이어 붙일 때만. */
  id?: string;
}

export function DateField({
  value,
  onChange,
  "aria-label": ariaLabel,
  min,
  max,
  disabled = false,
  clearable = false,
  quickPicks,
  markedDate,
  markedLabel,
  className,
  wrapClassName,
  id,
}: DateFieldProps) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const hintId = useId();
  const monthLabelId = useId();

  // 밖에서 값이 바뀌면 초안을 버리고 따른다. 타이핑 중(포커스가 이 칸에 있을 때)은 예외다.
  useEffect(() => {
    if (inputRef.current === document.activeElement) return;
    setText((current) => (unformatDate(current) === unformatDate(value) ? current : value));
  }, [value]);

  useLayoutEffect(() => {
    const element = inputRef.current;
    const digitsBeforeCaret = pendingCaretRef.current;
    if (element === null || digitsBeforeCaret === null) return;
    pendingCaretRef.current = null;
    const position = caretAfterDateFormat(element.value, digitsBeforeCaret);
    element.setSelectionRange(position, position);
  });

  function applyValue(next: string) {
    setText(next);
    onChange(next);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const element = event.currentTarget;
    const rawCaret = element.selectionStart ?? element.value.length;
    // 캐럿을 문자 인덱스가 아니라 **그 앞의 숫자 개수**로 기억한다(구분자는 표시일 뿐이다).
    pendingCaretRef.current = toDateDigits(element.value.slice(0, rawCaret)).length;
    const digits = toDateDigits(element.value);
    const formatted = formatDateDigits(digits);
    setText(formatted);
    if (digits === "") {
      onChange("");
      return;
    }
    if (isCompleteDateDigits(digits) && isValidISO(formatted) && isWithinRange(formatted, min, max)) {
      onChange(formatted);
    }
  }

  /** ↑↓ 하루 · PageUp/PageDown 한 달 — 네이티브가 세그먼트 단위로 주던 것을 날짜 단위로 갚는다. */
  function stepBy(kind: "day" | "month", direction: 1 | -1) {
    const base = isValidISO(value) ? value : clampISO(todayISO(), min, max);
    const moved = kind === "day" ? addDays(base, direction) : addMonths(base, direction);
    applyValue(clampISO(moved, min, max));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && event.altKey) {
      event.preventDefault();
      openPanel();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      stepBy("day", event.key === "ArrowUp" ? 1 : -1);
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      stepBy("month", event.key === "PageUp" ? 1 : -1);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  // **입력칸**을 떠나면 미완성·무효 초안은 값으로 되돌린다. 상자 전체(달력 버튼·패널 포함)가
  // 아니라 입력칸 기준인 것이 중요하다 — 초안을 쓰다 말고 달력을 여는 것도 "이 초안은 값이
  // 아니다"에 해당하고, 그때 되돌리지 않으면 화면의 글자와 실제 값이 어긋난 채 남는다.
  function revertDraftIfNeeded() {
    setText((current) => (unformatDate(current) === unformatDate(value) ? current : value));
  }

  // 다시 열 때 청크를 또 기다리지 않는다 — 동적 import 는 모듈 레지스트리에 캐시되고
  // `React.lazy` 도 해결된 컴포넌트를 기억한다. 그래서 닫을 때 언마운트해도 대가가 없다.
  function openPanel() {
    setOpen(true);
  }

  function closePanel(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) inputRef.current?.focus();
  }

  /** 상자 밖으로 포커스가 나가면 패널을 닫는다. 포털이 없으므로 이 검사 하나로 충분하다. */
  function handleWrapperBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next !== null && event.currentTarget.contains(next)) return;
    setOpen(false);
  }

  const digits = toDateDigits(text);
  const problem = describeProblem(digits, text, min, max);
  const hint = problem ?? describeValue(value);

  return (
    <div className={wrapClassName === undefined ? WRAP : `${WRAP} ${wrapClassName}`} onBlur={handleWrapperBlur}>
      <div className={INPUT_ROW}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={ISO_PLACEHOLDER}
          aria-label={ariaLabel}
          aria-describedby={hint === "" ? undefined : hintId}
          value={text}
          disabled={disabled}
          className={className === undefined ? INPUT_BASE : `${INPUT_BASE} ${className}`}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={revertDraftIfNeeded}
          onFocus={preloadCalendar}
          onPointerEnter={preloadCalendar}
        />
        <button
          type="button"
          className={TOGGLE_BUTTON}
          disabled={disabled}
          aria-expanded={open}
          aria-label={`${ariaLabel} 달력 ${open ? "닫기" : "열기"}`}
          onPointerEnter={preloadCalendar}
          onClick={() => {
            if (open) closePanel(true);
            else openPanel();
          }}
        >
          <IconCalendar size={20} />
        </button>
      </div>

      {hint !== "" && (
        <p id={hintId} className={problem === null ? HINT : HINT_PROBLEM}>
          {hint}
        </p>
      )}

      {open && (
        <Suspense
          fallback={
            <div className={PANEL_FALLBACK}>
              <Loading srOnly />
            </div>
          }
        >
          <DateCalendar
            value={isValidISO(value) ? value : ""}
            min={min}
            max={max}
            quickPicks={quickPicks}
            markedDate={markedDate}
            markedLabel={markedLabel}
            labelId={monthLabelId}
            onSelect={applyValue}
            onClose={() => closePanel(true)}
            onClear={clearable ? () => {
              applyValue("");
              closePanel(true);
            } : undefined}
          />
        </Suspense>
      )}
    </div>
  );
}

/** 값이 확정됐을 때 아래 줄이 하는 말 — 네이티브가 못 보여 주던 요일과 남은 날이 여기 있다. */
function describeValue(value: string): string {
  if (!isValidISO(value)) return "";
  const offset = diffDays(todayISO(), value);
  if (offset === null) return formatKorean(value);
  return `${formatKorean(value)} · ${describeOffset(offset)}`;
}

function describeOffset(offset: number): string {
  if (offset === 0) return "오늘";
  if (offset === 1) return "내일";
  if (offset === -1) return "어제";
  return offset > 0 ? `${String(offset)}일 뒤` : `${String(-offset)}일 전`;
}

/**
 * 잘못된 입력을 **그 자리에서** 말한다. 종전엔 조용히 통과했다가 제출 시점에 422 로 돌아왔다.
 * 아직 다 치지 않은 값은 문제로 치지 않는다 — 타이핑 중에 빨간 글씨를 띄우지 않는다.
 */
function describeProblem(digits: string, text: string, min?: string, max?: string): string | null {
  if (!isCompleteDateDigits(digits)) return null;
  if (!isValidISO(text)) return "그런 날짜는 없어요. 다시 확인해 주세요.";
  if (min !== undefined && min !== "" && text < min) return `${formatKorean(min)} 이후로 골라 주세요.`;
  if (max !== undefined && max !== "" && text > max) return `${formatKorean(max)} 이전으로 골라 주세요.`;
  return null;
}
