// 날짜 입력 — `<input type="date">` 를 대체한다(D20). `NumberInput`(숫자) 의 날짜 쪽 짝이다.
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
// ## [2026-08-30 개정] 값을 만드는 길은 캘린더 하나뿐이다
//
// 첫 판(2026-08-29)은 네이티브의 세그먼트 타이핑을 갚으려고 **ISO 마스크 타이핑**을 함께 뒀다.
// 그 대가가 컸다 — 값의 진실이 두 곳(로컬 초안과 부모의 `value`)에 살고, 그 이중성이 초안
// 되돌리기 · 캐럿 보존 · 오타 안내라는 부수 장치 셋을 끌고 왔다. 게다가 모바일에서는 칸을 누르는
// 순간 숫자 키패드가 올라와 **바로 아래 펼쳐질 캘린더를 덮었다.**
//
// 그래서 입력칸을 **트리거 버튼**으로 바꾼다. 값을 바꾸는 길은 캘린더(그리고 그 위의 키보드
// 단축)뿐이고, 그 덕에 **실존하지 않는 날짜와 범위 밖 값이 구조적으로 만들어질 수 없다.**
// 화면 모양은 그대로다 — 호출부가 넘기던 클래스가 요소를 가리지 않는 유틸리티라, `<input>` 을
// `<button>` 으로 갈아끼워도 테두리·높이·여백이 픽셀 그대로다(`Select.tsx` 의 트리거와 같은 수법).
//
// ## 잃는 것은 하나도 남기지 않고 갚는다 (NumberInput 머리말과 같은 규칙)
//
//   모바일 피커        → 인라인 월 그리드(`DateCalendar`, 셀 44px)
//   임의 연월로 점프   → 캘린더 헤더의 연·월 드롭다운 두 개 (숫자 8타를 3탭으로 갚는다)
//   상대 날짜 빠른 입력 → `quickPicks` 칩 (오늘 · 1주 뒤 · 1개월 뒤 / 오늘 · 어제)
//   ↑↓ 세그먼트 증감   → 트리거에서 ↑↓ 하루 · PageUp/PageDown 한 달 (그대로 살아 있다)
//   min/max 클램프     → props + 범위 밖 셀 비활성 + **들어온 값이 범위 밖이면 힌트 줄이 안내**
//   지우기             → `clearable` 일 때 캘린더 안 「지우기」
//   로케일 표시        → 한국어 고정 서식. 브라우저별 편차가 사라진다
//   date 시맨틱        → `aria-expanded` + `aria-controls` 를 단 트리거(펼침 패턴) + 캘린더는 표 시맨틱
//
// **잃는 것 하나**: 붙여넣기. 이 앱의 날짜 6필드에 붙여넣을 원본이 없다(영수증·청첩장은 종이와
// 이미지다). 대신 캘린더가 요일과 남은 날수를 그 자리에서 보여 준다.
//
// **값은 언제나 ISO `YYYY-MM-DD` 문자열이다** — `onChange` 로 올라가는 것이 그렇다. 사람이 읽는
// 서식은 화면에만 산다. 덕분에 API 계약도 부모의 상태도 그대로다. 이제 로컬 state 는 **여닫힘
// 뿐**이고 값에 대한 초안은 없다 — `NumberInput` 의 「완전 제어」 원칙으로 돌아왔다.
//
// ## 닫는 길은 셋뿐이다 — 「닫기」 · Esc · 상자 밖 누르기
//
// [2026-08-30 사용자 지시] 날짜를 골라도 닫지 않는다. 즉시 닫히면 잘못 누른 날을 고치려고 다시
// 열어야 하고, 「골랐다」는 사실을 그리드에서 확인할 틈도 없다(모바일에서는 손가락이 그 자리를
// 가리고 있어 더 그렇다). 「지우기」도 같다. 근거는 `DateCalendar` 의 `pick` 주석에 있다.
//
// 그 결과 **패널이 열린 채로 다른 것을 누르는 일이 흔해졌고**, 그래서 바깥 누르기 판정이
// 「누른 순간」이 아니라 「눌렀다 뗀 순간」이 됐다(아래 리스너 주석 — 흐름 안 패널이라 닫는
// 순간 아래 것들이 460px 올라온다).
//
// ## 여닫기 — 첫 열림 이후에는 접어 두기만 한다
//
// 조건부 렌더는 **나갈 프레임이 없어** 닫힘 전환을 만들 수 없다. 그래서 `hasOpened` 하나를 두어
// 한 번도 열지 않았으면 렌더하지 않고(첫 화면의 청크 이점은 그대로), 한 번 연 뒤에는 높이 0 으로
// 접어 둔다. 접힌 동안 `inert` 로 Tab 과 스크린리더를 막는 것까지 `DisclosurePanel` 이 이미
// 검증한 짝이다(그 파일 머리말 §1~§3). 그 컴포넌트를 재사용하지 않는 것은 그쪽이 `p-4` 컨테이너를
// 전제하고 `-mx-4` 짝을 갖고 있기 때문이다 — 여기는 패널 안쪽 여백(8px + 보더 1px)이 포커스 링
// 4px 을 이미 덮어 그 보정이 필요 없다.
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import {
  addDays,
  addMonths,
  clampISO,
  diffDays,
  formatKorean,
  isValidISO,
  todayISO,
  type DateQuickPick,
} from "@/shared/lib/date";
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
const TRIGGER_ROW = "flex items-stretch gap-1";
/**
 * 호출부의 클래스와 합쳐져 종전 `<input>` 과 같은 상자를 만든다.
 *
 * `text-left` 가 빠지면 값이 가운데로 뜬다 — `<button>` 의 UA 기본 정렬이 가운데다.
 * `min-w-0` 는 아래 `truncate` 의 짝이다(없으면 flex 아이템의 자동 최소 크기가 내용 폭이라
 * 애초에 줄지 않는다 — `Select.tsx` 트리거가 같은 이유로 같은 짝을 쓴다).
 *
 * 잠긴 모양은 **오른쪽 달력 버튼과 같은 값**(50%)을 쓴다. 종전 `<input>` 은 이 자리가
 * 브라우저마다 갈렸다 — Safari 는 잠긴 입력의 글자를 UA 가 흐리게 칠하고(-webkit-text-fill-color)
 * Chrome 은 호출부의 `text-ink` 가 이겨 멀쩡해 보였다. 한쪽만 흐린 행이 남지 않게 값을 고정한다.
 */
const TRIGGER_BASE =
  "flex min-w-0 flex-1 cursor-pointer items-center text-left disabled:cursor-not-allowed disabled:opacity-50";
/** 한 줄 + 말줄임을 유지한다 — 값에 따라 행 높이가 출렁이면 결제 목록의 행이 통째로 들썩인다. */
const TRIGGER_VALUE = "min-w-0 truncate";
const TRIGGER_PLACEHOLDER = "min-w-0 truncate text-ink-soft";
const TOGGLE_BUTTON =
  "flex h-tap w-tap flex-none items-center justify-center rounded-md border border-line bg-surface text-ink-soft " +
  "transition-colors duration-150 enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";
const HINT = "text-xs text-ink-soft";
const HINT_PROBLEM = "text-xs font-bold text-primary";
/**
 * 높이 전환은 `0fr ↔ 1fr` 이다 — 콘텐츠 높이를 브라우저가 잡으므로 매직 넘버가 없다.
 * 안쪽의 넘침 자르기는 장식이 아니라 필수 조건이고(그리드 아이템의 자동 최소 크기를 0 으로
 * 바꾼다), 크기 전환이라 `duration-200` 이다(색 전환 150 과 구분하는 이 저장소 관례).
 * 근거는 전부 `DisclosurePanel.tsx` 머리말 §1·§2 에 있다.
 * ⚠️ 조각을 이어 붙이지 않고 완성된 리터럴 둘을 둔다 — Tailwind 스캐너는 소스를 평문으로 읽어
 * 런타임 조립을 찾지 못하고, 빌드는 성공한 채 스타일만 사라진다.
 */
const PANEL_CLIP_OPEN = "grid grid-rows-[1fr] transition-[grid-template-rows] duration-200";
const PANEL_CLIP_CLOSED = "grid grid-rows-[0fr] transition-[grid-template-rows] duration-200";
const PANEL_FALLBACK = "mt-2 h-72 rounded-md border border-line bg-surface";

/** 값이 없을 때 트리거가 하는 말. 서식이 아니라 **할 일**을 적는다 — 칠 수 없는 칸이므로. */
const EMPTY_LABEL = "날짜 선택";

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
  /**
   * 트리거 자체의 클래스 — 지금까지 각 화면이 `<input>` 에 직접 주던 그 값이다. **한 줄도 고칠
   * 필요가 없다**: 호출부 6곳이 넘기는 것은 전부 요소를 가리지 않는 유틸리티다
   * (`min-h-tap w-full rounded-md border border-line bg-surface px-2.5 text-base text-ink`).
   *
   * 글자 크기는 **안 줘도 안전하다** — `shared/ui/styles.css` 의 base 레이어가 폼 컨트롤 바닥을
   * 16px 로 깐다(D24). 다만 **16px 아래로 내리는 것은 여전히 금지다** — a11y.md §2.5.
   */
  className?: string;
  /** 바깥 상자의 클래스(flex 부모 안에서의 배치 등). NumberInput 이 슬롯을 둘로 가른 것과 같은 이유. */
  wrapClassName?: string;
  /** 바깥 `<label htmlFor>` 와 이어 붙일 때만. `<button>` 도 labelable 요소라 배선이 같다. */
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
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const panelId = useId();
  const monthLabelId = useId();

  // 바깥을 누르면 닫는다.
  //
  // 🚨 이 리스너는 선택이 아니라 아래 `handleWrapperBlur` 의 **짝**이다. 종전에는 「바깥 클릭」이
  // 포커스 이탈 하나로 처리됐는데, 그것이 모바일 결함의 원인이었다(그쪽 주석).
  //
  // ⚠️ **`Select.tsx` 와 달리 누른 순간이 아니라 뗀 순간에 닫는다.** 그쪽 팝업은 흐름 밖
  // (`absolute`)이라 닫혀도 아래 것들이 움직이지 않지만, 이 패널은 **흐름 안에서 아래를 460px
  // 남짓 밀어낸다.** 누른 순간 닫으면 그 높이가 사라지며 손가락 밑의 요소가 위로 올라가고,
  // 브라우저는 뗀 자리를 기준으로 클릭 대상을 정하므로 **누르려던 버튼이 눌리지 않는다.**
  // 날짜를 골라도 닫히지 않게 된 뒤로(§여닫기) 「연 채로 다른 것을 누르는」 일이 흔해져 실제
  // 경로가 됐다. 눌린 곳과 뗀 곳이 **둘 다** 바깥일 때만 닫으면, 클릭은 원래 대상에 그대로
  // 도착하고 패널은 그 직후에 접힌다.
  //
  // `click` 이 아니라 포인터 이벤트인 이유 — iOS Safari 는 클릭 핸들러가 없는 요소에 `click` 을
  // 내지 않는다. 배경 여백을 눌러 닫는 길이 그 기기에서만 막힌다.
  useEffect(() => {
    if (!open) return;
    let pressedOutside = false;
    function isOutside(target: EventTarget | null) {
      return !wrapperRef.current?.contains(target as Node);
    }
    function handleDown(event: PointerEvent) {
      pressedOutside = isOutside(event.target);
    }
    function handleUp(event: PointerEvent) {
      if (pressedOutside && isOutside(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handleDown);
    document.addEventListener("pointerup", handleUp);
    return () => {
      document.removeEventListener("pointerdown", handleDown);
      document.removeEventListener("pointerup", handleUp);
    };
  }, [open]);

  /** ↑↓ 하루 · PageUp/PageDown 한 달 — 네이티브가 세그먼트 단위로 주던 것을 날짜 단위로 갚는다. */
  function stepBy(kind: "day" | "month", direction: 1 | -1) {
    const base = isValidISO(value) ? value : clampISO(todayISO(), min, max);
    const moved = kind === "day" ? addDays(base, direction) : addMonths(base, direction);
    onChange(clampISO(moved, min, max));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
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

  function openPanel() {
    setHasOpened(true);
    setOpen(true);
  }

  function closePanel(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  /**
   * 포커스가 상자 밖 요소로 옮겨 가면 닫는다(Tab 으로 빠져나가는 경로).
   *
   * 🚨 [2026-08-30] `relatedTarget === null` 일 때 닫던 줄이 **모바일에서 캘린더를 못 쓰게
   * 만들고 있었다.** iOS·macOS Safari 는 탭으로 `<button>` 에 포커스를 주지 않는다. 그래서
   * ‹ · 연·월 · › 를 터치하면 그리드 셀이 포커스를 잃으며 `relatedTarget` 없이 이 핸들러가
   * 돌았고, `pointerdown` 시점에 패널이 사라져 **`click` 이 도착할 요소가 없었다.**
   *
   * 그래서 판정을 둘로 갈랐다 — 포커스가 어디로 갔는지 **알 때만** 여기서 닫고, 「바깥을
   * 눌렀다」는 위 `pointerdown` 리스너가 맡는다. 포털이 없으므로 두 검사 다 `contains` 하나면 된다.
   */
  function handleWrapperBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next === null || event.currentTarget.contains(next)) return;
    setOpen(false);
  }

  const hasValue = isValidISO(value);
  const problem = describeProblem(value, min, max);
  const hint = problem ?? describeOffset(value);
  const display = hasValue ? formatKorean(value) : EMPTY_LABEL;

  return (
    <div
      ref={wrapperRef}
      className={wrapClassName === undefined ? WRAP : `${WRAP} ${wrapClassName}`}
      onBlur={handleWrapperBlur}
    >
      <div className={TRIGGER_ROW}>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          // 값을 접근명에 싣는다 — `<button>` 은 combobox 처럼 「값」을 따로 낭독해 주지 않는다.
          // "예정일, 2027년 5월 15일 (토)" 처럼 읽힌다.
          aria-label={`${ariaLabel}, ${display}`}
          aria-expanded={open}
          // 첫 열림 전에는 패널이 DOM 에 없다 — 없는 id 를 가리키지 않는다.
          aria-controls={hasOpened ? panelId : undefined}
          aria-describedby={hint === "" ? undefined : hintId}
          disabled={disabled}
          className={className === undefined ? TRIGGER_BASE : `${TRIGGER_BASE} ${className}`}
          onClick={() => {
            if (open) closePanel(false);
            else openPanel();
          }}
          onKeyDown={handleKeyDown}
          onFocus={preloadCalendar}
          onPointerEnter={preloadCalendar}
        >
          <span className={hasValue ? TRIGGER_VALUE : TRIGGER_PLACEHOLDER}>{display}</span>
        </button>
        <button
          type="button"
          className={TOGGLE_BUTTON}
          disabled={disabled}
          aria-expanded={open}
          aria-controls={hasOpened ? panelId : undefined}
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

      {hasOpened && (
        <div id={panelId} className={open ? PANEL_CLIP_OPEN : PANEL_CLIP_CLOSED}>
          <div className="overflow-hidden" inert={!open}>
            <Suspense
              fallback={
                <div className={PANEL_FALLBACK}>
                  <Loading srOnly />
                </div>
              }
            >
              <DateCalendar
                open={open}
                value={hasValue ? value : ""}
                min={min}
                max={max}
                quickPicks={quickPicks}
                markedDate={markedDate}
                markedLabel={markedLabel}
                labelId={monthLabelId}
                onSelect={onChange}
                onClose={() => closePanel(true)}
                // 「지우기」도 닫지 않는다 — 고르기와 같은 규칙이다(`DateCalendar` 의 `pick`).
                // 비운 다음 곧바로 다시 고르는 것이 이 버튼을 누르는 흔한 이유이기도 하다.
                onClear={clearable ? () => onChange("") : undefined}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 힌트 줄이 하는 말 — 네이티브가 못 보여 주던 「며칠 남았나」다.
 * 요일은 이제 트리거가 이미 말하고 있으므로 여기서 되풀이하지 않는다.
 */
function describeOffset(value: string): string {
  if (!isValidISO(value)) return "";
  const offset = diffDays(todayISO(), value);
  if (offset === null) return "";
  if (offset === 0) return "오늘";
  if (offset === 1) return "내일";
  if (offset === -1) return "어제";
  return offset > 0 ? `${String(offset)}일 뒤` : `${String(-offset)}일 전`;
}

/**
 * 범위 밖 값을 **그 자리에서** 말한다. 종전엔 조용히 통과했다가 제출 시점에 422 로 돌아왔다.
 *
 * 이제 캘린더는 범위 밖 셀을 비활성으로 두므로 사용자가 여기 걸릴 길은 없다. 남은 경로는
 * **밖에서 그런 값이 들어오는 것** 하나다 — 예컨대 결제 행에서 「이미 결제했어요」를 켜면 그
 * 칸의 `max` 가 오늘로 바뀌고, 그 전에 들어 있던 미래의 예정일이 그 순간 범위 밖이 된다.
 */
function describeProblem(value: string, min?: string, max?: string): string | null {
  if (!isValidISO(value)) return null;
  if (min !== undefined && min !== "" && value < min) return `${formatKorean(min)} 이후로 골라 주세요.`;
  if (max !== undefined && max !== "" && value > max) return `${formatKorean(max)} 이전으로 골라 주세요.`;
  return null;
}
