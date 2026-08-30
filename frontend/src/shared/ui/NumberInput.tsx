// 숫자(주로 금액) 입력 — `Money` 의 입력 쪽 짝이다.
//
// `Money` 가 **출력**의 단일 출처인 이유(shared/ui/README 규범 6: "화면마다 toLocaleString 을
// 직접 부르면 표기가 조용히 갈린다")는 **입력**에도 그대로 적용된다. 오히려 입력 쪽이 더하다 —
// 캐럿 보존·붙여넣기 정화·IME·빈 칸 처리·스텝 복원은 각각이 버그 온상이라, 7개 화면에
// 손으로 복붙하면 7가지 미묘하게 다른 동작이 남는다.
//
// **`<input type="number">` 를 쓰지 않는다.** 이유와 그 대가는 `shared/lib/number-input.ts`
// 머리말에 적었다. 요약하면 (1) 스펙상 콤마를 넣을 수 없고 (2) `-`·`.`·`e` 를 전부 통과시킨다.
// 대신 잃는 것은 이 파일이 하나도 남기지 않고 갚는다:
//
//   모바일 숫자 키패드   → inputMode="numeric"
//   ↑↓ 키 스텝          → handleKeyDown
//   ▲▼ 스피너 클릭      → 아래 커스텀 버튼(길게 누르기 반복 포함)
//   spinbutton 시맨틱   → role + aria-value*
//   min/max            → 스텝·포커스 이탈 시점 클램프
//
// 덤으로 두 가지가 개선된다 — 필드 위 마우스 휠로 금액이 바뀌던 사고가 사라지고(텍스트 입력은
// 휠에 반응하지 않는다), 숫자 아닌 문자가 비로소 실제로 막힌다.
//
// **내부 표시 state 를 두지 않는다.** 완전 제어 컴포넌트다 — 표시 문자열은 언제나 `value` 에서
// 파생된다. 로컬 초안을 들면 "부모 값과 표시가 어긋났을 때 누가 이기는가"를 매 경로마다
// 정해야 하고(게이지바 드래그 중, 부모의 클램프, 외부 리셋…), 그 분기가 이 컴포넌트에서
// 가장 흔한 버그 유형이다. 빈 칸은 로컬 플래그가 아니라 `value === null` 로 표현해
// 그 분기 자체를 없앴다.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { caretAfterFormat, groupDigits, normalizeDigits, stepValue, toDigits } from "@/shared/lib/number-input";
import { IconChevronDown } from "./icons";

// 네이티브 스피너의 반복 감각을 옮긴 값(Chrome 실측 대역). 상수로 빼 두면 테스트가
// "400ms 지나면 반복이 시작된다"는 계약을 이름으로 읽는다.
const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 60;

/** Shift 동반 시 배수. 네이티브에 없던 추가 기능 — 수백만원대를 스텝으로 옮길 때 10번 누르지 않게 한다. */
const SHIFT_MULTIPLIER = 10;

// ⚠️ 클래스는 완성된 리터럴로만 적는다 — Tailwind 스캐너는 소스를 평문으로 읽어 런타임 조립을
// 찾지 못하고, **빌드는 성공한 채 스타일만 사라진다**(CLAUDE.md §5.1, onboarding-styles.ts 머리말).
// flex(블록 레벨)다 — inline-flex 면 `w-full` 입력을 감싼 자리에서 래퍼가 내용 폭으로 줄어들어
// 입력이 부모를 못 채운다(AddPaymentRow 의 세로 폼이 그 경우다). 폭이 고정된 호출부(w-28 등)는
// 어차피 입력 쪽 클래스가 정하므로 블록이어도 영향이 없다.
const WRAP = "flex items-stretch gap-1";
// pointer-coarse:hidden — 터치 기기에서는 숨긴다. 모바일 브라우저도 네이티브 스피너를 그리지
// 않으므로 파리티가 유지되고, 22px 버튼을 엄지로 누를 일이 없어진다(아래 터치 타겟 주석).
const SPINNER_COLUMN = "flex h-tap flex-none flex-col overflow-hidden rounded-md border border-line pointer-coarse:hidden";
// 버튼 하나는 22px 로 이 저장소의 44px 터치 타겟 규범(min-h-tap)에 못 미친다. 예외로 두는 근거:
// (a) coarse 포인터에서 아예 숨겨 터치 사용자가 만나지 않고, (b) 같은 화면의 44px 입력칸 직접
// 타이핑과 ↑↓ 키가 **동일 기능의 대체 수단**이라 WCAG 2.5.8 의 "equivalent control" 예외에
// 해당한다. 같은 판단의 선례가 이미 있다 — Step2RegionBudget.tsx 의 MINI_TOGGLE 주석.
// 그림자 금지(D10)와 링 금지(D9)를 지킨다 — 색은 ink-soft/primary/line 안에 머문다(D8).
// ⚠️ 이 주석에 D9 가 금지한 유틸리티 이름을 **평문으로 적지 않는다.** 스캐너는 주석도 후보로
// 삼아 산출 CSS 를 만들고, 그러면 빌드 게이트가 이 파일을 잡는다 — 실제로 한 번 잡혔다
// (BudgetDonut.tsx 머리말이 같은 사고를 기록해 둔 그 함정이다).
const SPINNER_BUTTON =
  "flex h-5.5 w-6 flex-none cursor-pointer items-center justify-center text-ink-soft " +
  "transition-colors duration-150 enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";

// 직접 타이핑한 한 글자는 여기서 막는다 — 잘못된 문자가 **한 프레임도 화면에 보이지 않는다.**
// 붙여넣기(insertFromPaste)는 막지 않는다: "₩1,234,567원" 을 통째로 거부하는 대신
// onChange 가 숫자만 남기는 쪽이 사용자가 기대하는 동작이다.
//
// props 를 하나도 읽지 않으므로 모듈 스코프에 둔다(렌더마다 다시 만들지 않는다).
function rejectNonDigitTyping(event: FormEvent<HTMLInputElement>) {
  const native = event.nativeEvent;
  if (!(native instanceof InputEvent)) return;
  if (native.inputType !== "insertText") return;
  if (native.data !== null && toDigits(native.data) !== native.data) event.preventDefault();
}

export interface NumberInputProps {
  /** 실제 값 — 콤마 없는 정수. **`null` 은 빈 칸**이다(0 과 다르다: 0 은 "0원으로 확정"). */
  value: number | null;
  onValueChange: (next: number | null) => void;
  /**
   * ↑↓ 키와 ▲▼ 버튼의 1회 증감폭. **주지 않으면 스텝 기능과 스피너를 아예 그리지 않는다** —
   * 눌러도 아무 일이 없는 장식 버튼을 만들지 않기 위해서다.
   */
  step?: number;
  /** 기본 0. 지금 모든 호출부가 음수를 허용하지 않는다. */
  min?: number;
  max?: number;
  disabled?: boolean;
  /**
   * 입력칸 자체의 클래스. 지금까지 각 화면이 `<input>` 에 직접 주던 그 값이다.
   *
   * 글자 크기는 **안 줘도 안전하다** — `shared/ui/styles.css` 의 base 레이어가 폼 컨트롤 바닥을
   * 16px 로 깐다(D24). 종전엔 이 슬롯을 비우면 바깥 라벨의 14px 을 물려받아 iOS 가 포커스에서
   * 확대했다(a11y.md §5 「가장 먼저 볼 함정」). **16px 아래로 내리는 것은 여전히 금지다** — §2.5.
   */
  className?: string;
  /**
   * 래퍼(입력칸+스피너를 묶는 상자)의 클래스.
   *
   * 클래스 슬롯이 둘인 이유 — 이 컴포넌트는 상자를 두 개 그린다. 부모가 flex 행이면
   * **래퍼가 flex 아이템**이 되므로 `flex-1` 같은 배치 클래스는 입력칸이 아니라 래퍼에
   * 걸려야 한다. 하나로 합치면 "왜 w-full 을 줬는데 안 늘어나지"가 화면마다 재발한다.
   */
  wrapClassName?: string;
  /** 바깥 `<label htmlFor>` 와 이어 붙일 때만 쓴다 — 라벨 클릭으로 포커스가 오게 한다. */
  id?: string;
  /** 필수 — 이 컴포넌트는 라벨을 스스로 그리지 않는다(호출부의 레이아웃이 제각각이다). */
  "aria-label": string;
  placeholder?: string;
}

export function NumberInput({
  value,
  onValueChange,
  step,
  min = 0,
  max,
  disabled = false,
  className,
  wrapClassName,
  id,
  "aria-label": ariaLabel,
  placeholder,
}: NumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // 이번 렌더에서 복원해야 할 캐럿 위치(= 캐럿 앞 숫자 개수). null 이면 건드리지 않는다 —
  // 스텝이나 부모의 외부 변경으로 리렌더될 때 캐럿을 멋대로 옮기지 않기 위해서다.
  const pendingCaretRef = useRef<number | null>(null);
  // 반복 타이머가 **항상 최신 값**에서 다음 스텝을 계산하게 한다. 타이머 콜백은 생성 시점의
  // 렌더를 클로저로 붙잡으므로, prop 을 그대로 읽으면 첫 틱 이후 값이 제자리걸음한다.
  const valueRef = useRef(value);
  valueRef.current = value;

  // **딱 하나 있는 로컬 state.** 사용자가 방금 칸을 비웠다는 사실이다.
  //
  // 부모가 빈 칸을 표현하지 못하는 자리가 있다 — Step8Allocation·CategoryAllocationRow 의
  // 금액은 슬라이더와 상태를 공유해 늘 숫자여야 하므로 `null` 을 0으로 되돌려 보낸다. 그때
  // 0을 그대로 그리면 (1) 지운 사람의 의도와 다르고 (2) 캐럿이 "0" 앞에 놓여 이어서 친 "3"이
  // **30** 이 된다. 그래서 "비웠다"는 사실만 이쪽이 기억한다.
  //
  // 되돌리는 조건을 값 비교가 아니라 **다음 상호작용**으로 잡는다(다음 입력·포커스 이탈·스텝).
  // 부모 값과 비교해 "누가 이겼는지" 판정하려 들면 부모마다 다른 강제 규칙을 모두 알아야 하고,
  // 그 분기가 바로 이 컴포넌트에서 가장 흔한 버그 유형이다. 슬라이더처럼 외부에서 값이 바뀌는
  // 경로는 포인터가 이 칸을 떠나며 onBlur 가 먼저 나므로 자연히 풀린다.
  const [cleared, setCleared] = useState(false);
  const showEmpty = cleared || value === null;

  const display = showEmpty ? "" : groupDigits(String(Math.round(value)));

  // 포맷으로 문자열 길이가 바뀐 뒤 캐럿을 제자리에 돌려놓는다. useLayoutEffect 라 페인트 전에
  // 끝나 깜빡임이 없다. 의존성 배열을 두지 않는 이유 — 복원 여부는 ref 플래그가 정하므로
  // "언제 다시 실행되는가"를 값 목록으로 다시 표현할 필요가 없다.
  useLayoutEffect(() => {
    const element = inputRef.current;
    const digitsBeforeCaret = pendingCaretRef.current;
    if (element === null || digitsBeforeCaret === null) return;
    pendingCaretRef.current = null;
    const position = caretAfterFormat(element.value, digitsBeforeCaret);
    element.setSelectionRange(position, position);
  });

  // ── 반복(길게 누르기) ────────────────────────────────────────────────
  const repeatRef = useRef<{ delay?: number; tick?: number }>({});

  function stopRepeat() {
    const timers = repeatRef.current;
    if (timers.delay !== undefined) window.clearTimeout(timers.delay);
    if (timers.tick !== undefined) window.clearInterval(timers.tick);
    repeatRef.current = {};
    window.removeEventListener("pointerup", stopRepeat);
    window.removeEventListener("pointercancel", stopRepeat);
  }

  // 언마운트 정리 — 빠뜨리면 사라진 컴포넌트의 타이머가 계속 돌며 값을 올린다.
  // pointerup 을 window 에서 듣는 이유는 버튼 밖에서 손을 떼는 경우를 놓치지 않기 위해서다.
  useEffect(() => stopRepeat, []);

  // 비운 칸에서 ↑ 는 "빈 값에서의 스텝"이어야 한다 — 부모가 0으로 강제해 둔 값을 읽으면
  // 안 된다(빈 칸과 0의 결과가 다를 수 있다: min 이 0보다 크면 갈린다).
  const emptyRef = useRef(showEmpty);
  emptyRef.current = showEmpty;

  function applyStep(direction: 1 | -1, multiplier = 1) {
    if (step === undefined || disabled) return;
    setCleared(false);
    const current = emptyRef.current ? null : valueRef.current;
    onValueChange(stepValue(current, direction, step * multiplier, min, max));
  }

  function startRepeat(direction: 1 | -1) {
    if (step === undefined || disabled) return;
    applyStep(direction);
    window.addEventListener("pointerup", stopRepeat);
    window.addEventListener("pointercancel", stopRepeat);
    repeatRef.current.delay = window.setTimeout(() => {
      repeatRef.current.tick = window.setInterval(() => {
        applyStep(direction);
      }, REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  }

  // ── 입력 ────────────────────────────────────────────────────────────
  function emit(nextDigits: string) {
    onValueChange(nextDigits === "" ? null : Number(nextDigits));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const element = event.currentTarget;
    const rawCaret = element.selectionStart ?? element.value.length;
    // 캐럿을 문자 인덱스가 아니라 **그 앞의 숫자 개수**로 기억한다(콤마는 표시일 뿐이다).
    pendingCaretRef.current = toDigits(element.value.slice(0, rawCaret)).length;
    const cleaned = normalizeDigits(toDigits(element.value));
    setCleared(cleaned === "");
    emit(cleaned);
  }

  // 한글 IME 는 조합 중 beforeinput 을 취소할 수 없는 경로가 있어, 조합이 끝난 뒤 한 번 더
  // 훑는다. 제어 컴포넌트인데도 DOM 값을 직접 되돌리는 이유 — 정화 결과가 현재 value 와
  // 같으면 React 가 리렌더를 하지 않아 DOM 에 남은 조합 문자가 그대로 보인다.
  function handleCompositionEnd(event: FormEvent<HTMLInputElement>) {
    const element = event.currentTarget;
    const cleaned = normalizeDigits(toDigits(element.value));
    element.value = groupDigits(cleaned);
    emit(cleaned);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (step === undefined) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    // 기본 동작(캐럿을 문자열 처음/끝으로 보내기)을 막는다.
    event.preventDefault();
    applyStep(event.key === "ArrowUp" ? 1 : -1, event.shiftKey ? SHIFT_MULTIPLIER : 1);
  }

  // 클램프는 onBlur 에서만 한다. 타이핑 중에 하면 max=100 인 칸에 "1000" 을 치려던 사람이
  // 세 번째 글자에서 100 으로 튕겨 나가 더 못 친다 — 네이티브도 입력 중에는 클램프하지 않는다.
  function handleBlur() {
    // 칸을 떠나면 "비운 상태"는 끝난다 — 부모가 들고 있는 값이 다시 진실이 된다.
    setCleared(false);
    // 포커스가 빠지면 반복도 멈춘다(스피너를 누른 채 탭 전환 등으로 pointerup 을 놓치는 경로 방어).
    stopRepeat();
    if (value === null) return;
    const clamped = Math.min(Math.max(value, min), max ?? Number.POSITIVE_INFINITY);
    if (clamped !== value) onValueChange(clamped);
  }

  return (
    <span className={wrapClassName === undefined ? WRAP : `${WRAP} ${wrapClassName}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        role="spinbutton"
        aria-label={ariaLabel}
        aria-valuenow={showEmpty ? undefined : value}
        aria-valuemin={min}
        aria-valuemax={max}
        // 숫자만 읽으면 자릿수가 흐려진다 — 화면에 보이는 것과 같은 콤마 형태로 준다.
        aria-valuetext={display === "" ? undefined : display}
        value={display}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        onChange={handleChange}
        onBeforeInput={rejectNonDigitTyping}
        onCompositionEnd={handleCompositionEnd}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {step !== undefined && (
        <span className={SPINNER_COLUMN}>
          {/* tabIndex=-1 + aria-hidden — 네이티브 스피너 버튼도 탭 순서에 들어가지 않고 AT 에
              별도 노드로 노출되지 않는다. 기능은 위 spinbutton 입력이 이미 노출하므로,
              버튼까지 노출하면 같은 기능이 두 번 낭독된다. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            disabled={disabled}
            className={SPINNER_BUTTON}
            onPointerDown={() => {
              startRepeat(1);
            }}
          >
            <IconChevronDown size={12} className="rotate-180" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            disabled={disabled}
            className={SPINNER_BUTTON}
            onPointerDown={() => {
              startRepeat(-1);
            }}
          >
            <IconChevronDown size={12} />
          </button>
        </span>
      )}
    </span>
  );
}
