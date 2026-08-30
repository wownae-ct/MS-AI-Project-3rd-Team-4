// 월 그리드 캘린더 — `DateField.tsx` 가 필드 바로 아래에 인라인으로 펼치는 패널.
//
// ## 왜 이 파일이 따로 있는가 (두 가지 이유가 겹친다)
//
// ① **번들.** `DateField` 는 첫 화면(대시보드)을 통해 초기 청크에 들어간다. 초기 청크 여유는
//    빌드 게이트 기준 수백 바이트뿐이고, 이 저장소는 그 바이트가 폰트 시작을 밀어 LCP 로
//    이어진다는 것을 실측해 두었다(`shared/ui/README.md` 「폰트」 · ADR 0005). 그래서
//    **그리드·키보드·월 이동은 첫 열림 때 받는 별도 청크**로 내린다 — `DateField` 가
//    `React.lazy` 로 감싸고, 필드에 포커스/호버가 닿는 순간 미리 받아 둔다(라우터의
//    `defaultPreload: "intent"` 와 같은 철학).
// ② **파일 크기.** `.oxlintrc.json` 이 파일당 300줄(주석 제외)을 강제한다.
//
// ## Base UI 를 쓰지 않는 이유
//
// Base UI 1.7.0 에 캘린더/데이트피커 계열이 **없다**(패키지 디렉터리 실측). Popover 로 띄우는
// 방법은 있지만 그러면 floating 위치 계산이 초기 경로에 얹히고, 무엇보다 이 저장소는 "모달 없이
// 인라인으로 펼친다"를 관례로 세워 뒀다(`AddPaymentRow` · `PaymentListRow` · `AddTimelineItemRow`
// 머리말). 인라인 패널은 포털·위치계산·스크롤 잠금이 전부 필요 없다.
//
// ## 접근성
//
// 네이티브 `<table>` + `<th scope="col">` 로 요일 열 관계를 그대로 남기고, 각 날짜는 버튼이다.
// 오늘은 `aria-current="date"`, **선택 여부는 버튼의 접근명**에 싣는다(그 이유는 `date-cell-style.ts`).
// 이동은 **로빙 탭인덱스** — 포커스 가능한 셀이 항상 하나뿐이라 Tab 한 번에 그리드를 빠져나간다
// (42개를 Tab 으로 지나가게 두지 않는다).
//
// ⚠️ **DOM 포커스는 키보드로 움직였을 때만 옮긴다.** 열릴 때 1회는 옮긴다(열자마자 방향키가
// 들어야 한다). 그러나 ‹ › 버튼이나 연·월 셀렉트로 달을 바꿀 때 포커스까지 그리드로 끌고 가면
// **키보드 사용자가 ‹ 를 한 번 누른 뒤 그 버튼을 잃는다.** 그래서 `moveFocusRef` 로 갈랐다.
//
// ## `open` 을 왜 받는가 — 접힌 채 살아 있기 때문이다
//
// 호출부(`DateField`)는 여닫기 전환을 위해 **첫 열림 이후 이 컴포넌트를 떼지 않는다**(그 파일
// 머리말 §여닫기). 그래서 「마운트 = 열림」이 더 이상 성립하지 않는다. 다시 열 때마다 보이는
// 달과 포커스 대상을 `value` 기준으로 되돌리지 않으면 **지난번에 둘러보던 달이 그대로 뜬다** —
// 고를 날짜와 무관한 달을 보여 주는 셈이라, 종전 조건부 렌더가 공짜로 주던 것을 잃는다.
//
// ## 시각 — 새 값을 만들지 않는다
//
// 선택 = primary 알약(배지 크기라 The One Accent Rule 안) · 오늘 = primary 테두리 · 범위 밖 =
// 흐림 + 비활성 · 주말 = **색이 아니라 글자 무게**로 가른다(D6 — 상태색을 지어내지 않는다).
// 그림자 0 · 링 0 · 팔레트 밖 색 0.
import { useEffect, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  clampISO,
  isWithinRange,
  monthGrid,
  parseISO,
  startOfMonth,
  todayISO,
  WEEKDAY_LABELS,
  type DateQuickPick,
} from "@/shared/lib/date";
import { dateCellClass, dateCellLabel } from "./date-cell-style";
import { IconChevronDown } from "./icons";
// 배럴(`index.ts`)이 아니라 직접 집는다 — 이 파일은 `DateField` 가 `React.lazy` 로 내린 별도
// 청크라, 배럴을 지나면 정적 참조가 생겨 초기 청크로 끌려온다(그 파일 머리말 §번들).
import { Select } from "./Select";

const DAYS_PER_WEEK = 7;
const MONTHS_PER_YEAR = 12;
/** 연 점프 셀렉트의 기본 범위. min/max 가 있으면 그쪽이 이긴다. */
const YEAR_SPAN_BACK = 5;
const YEAR_SPAN_FORWARD = 10;
const MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** 6주 고정 그리드의 각 주가 시작하는 인덱스. `monthGrid` 가 항상 42칸을 준다. */
const WEEK_START_INDEXES = [0, 7, 14, 21, 28, 35];

const PANEL = "mt-2 flex flex-col gap-2 rounded-md border border-line bg-surface p-2";
const HEADER_ROW = "flex items-center justify-between gap-1";
const NAV_BUTTON =
  "flex h-tap w-tap flex-none items-center justify-center rounded-md text-base text-ink-soft " +
  "transition-colors duration-150 enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";
const JUMP_GROUP = "flex flex-1 items-center justify-center gap-1";
const WEEKDAY_CELL = "h-8 text-xs font-bold text-ink-soft";
const WEEKDAY_CELL_WEEKEND = "h-8 text-xs font-bold text-ink";
/** `table-fixed` 가 7열을 같은 폭으로 나눈다.
 *
 * 🚨 [2026-08-29 정정] 이 줄은 *"375px 폰에서 카드 안쪽 343px ÷ 7 = 49px"* 라고 적혀 있었다.
 * **343px 은 카드가 아니라 페이지 안쪽 폭이다** — `Card` 의 `p-4`(32) + 보더(2) 와 이 패널의
 * `p-2`(16) 가 빠져 있었다. 실제 산술은 이렇다:
 *
 *   375px 기기 → 페이지 343 → 카드 안쪽 309 → 패널 안쪽 291 → ÷7 = 41.6 → `td` 의 `p-0.5` 를 빼면 **37.6px**
 *   320px 기기 → 페이지 288 → 카드 안쪽 254 → 패널 안쪽 236 → ÷7 = 33.7 → 같은 계산으로 **29.7px**
 *
 * 즉 셀의 **세로는 44px**(`date-cell-style.ts` 의 `min-h-tap`)이지만 **가로는 어느 폰에서도 44px 에
 * 못 미친다.** 이건 여백을 깎아 해결할 수 있는 종류가 아니다 — 7 × 44 = **308px** 이 필요한데
 * 320px 기기의 카드 안쪽은 254px 뿐이라 **기하학적으로 불가능**하다(카드 패딩을 전부 없애도,
 * 뷰포트 전체를 써도 320 ÷ 7 = 45.7px 로 겨우 턱걸이다).
 *
 * **그래서 가로는 WCAG 2.2 SC 2.5.8 AA(24 CSS px)를 기준으로 둔다** — 29.7px 이라 통과한다
 * (a11y.md §1.1 표: AA 최저선 24px · AAA 44px 은 권고). AAA 를 이 자리에서 지키려면 인라인
 * 패널이 아니라 화면을 덮는 오버레이여야 하는데, 그건 이 컴포넌트의 배치 결정을 통째로 뒤집는
 * 별건이다. **여백을 조금 깎아 34px 로 만드는 식의 절충은 하지 않는다** — AAA 도 못 넘기면서
 * 선택 표시가 서로 붙어 보이는 비용만 치른다.
 *
 * ⚠️ 위 폭 산술이 셀의 라운드를 정한 근거이기도 하다 — 가로 30~38px · 세로 44px 인 상자에
 * 999px 을 주면 세로로 긴 타원이 된다(`date-cell-style.ts` §라운드). */
const GRID_TABLE = "w-full table-fixed border-collapse";
/** 🚨 [2026-08-30] `rounded-pill` 이었다 — 사용자 리포트 *"라운드가 너무 둥금"*.
 *  이 패널의 다른 컨트롤이 전부 `rounded-md` 라, 칩만 알약이면 그 하나가 튄다. */
const CHIP =
  "min-h-tap rounded-md border border-line bg-surface px-3 text-sm font-bold text-ink-soft " +
  "transition-colors duration-150 hover:border-primary hover:text-primary";
const FOOTER_ROW = "flex items-center justify-end gap-2 border-t border-line pt-2";
const FOOTER_BUTTON =
  "min-h-tap rounded-md px-3 text-xs font-bold text-ink-soft transition-colors duration-150 hover:text-primary";

export interface DateCalendarProps {
  /** ISO 또는 빈 문자열. 빈 값이면 오늘(범위로 접은 값)에서 시작한다. */
  value: string;
  onSelect: (nextISO: string) => void;
  /** Esc · 「닫기」 · 선택 완료 시. 포커스를 입력칸으로 되돌리는 것은 호출부(`DateField`) 몫이다. */
  onClose: () => void;
  /** 주면 「지우기」가 뜬다 — 값이 있을 때만. 선택 입력(납부 예정일 등)에서만 넘긴다. */
  onClear?: () => void;
  min?: string;
  max?: string;
  quickPicks?: readonly DateQuickPick[];
  /** 그리드에 기준선으로 표시할 날짜 — 지금은 「결혼식 날짜」가 유일한 쓰임새다. */
  markedDate?: string;
  markedLabel?: string;
  /** 월 라벨과 그리드를 잇는 id. 화면 안에서 유일해야 한다. */
  labelId: string;
  /**
   * 지금 펼쳐져 있는가(기본 `true`). 호출부가 접힌 채로 이 컴포넌트를 남겨 두므로 필요하다 —
   * 머리말 §`open` 을 왜 받는가. 패널 안쪽만 보는 테스트는 그대로 기본값에 기댄다.
   */
  open?: boolean;
}

export function DateCalendar({
  value,
  onSelect,
  onClose,
  onClear,
  min,
  max,
  quickPicks,
  markedDate,
  markedLabel,
  labelId,
  open = true,
}: DateCalendarProps) {
  const today = todayISO();
  const [focused, setFocused] = useState(() => (value === "" ? clampISO(today, min, max) : value));
  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(value === "" ? clampISO(today, min, max) : value),
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLTableElement>(null);
  const moveFocusRef = useRef(true);
  const wasOpenRef = useRef(false);

  // ① **열리는 순간 1회** — 보이는 달과 포커스 대상을 `value` 로 되돌린다(머리말 §`open`).
  // `wasOpenRef` 로 「열림 전이」만 걸러 낸다. 열린 채로 값이 바뀌는 것은 ② 가 맡는다 —
  // 그쪽은 DOM 포커스를 건드리지 않아야 하기 때문에 한 곳에서 처리할 수 없다.
  // ⚠️ 이 effect 가 포커스 effect **앞에** 있어야 한다 — 같은 커밋에서 순서대로 돌아야
  // `moveFocusRef` 를 세운 뒤에 포커스가 걸린다.
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    const base = value === "" ? clampISO(today, min, max) : value;
    setFocused(base);
    setViewMonth(startOfMonth(base));
    moveFocusRef.current = true;
  }, [open, value, min, max, today]);

  // ② **열린 채로 값이 바뀌면** 보이는 달과 로빙 대상이 그 값을 따라간다. 날짜를 골라도 패널이
  // 닫히지 않게 되면서(2026-08-30) 필요해졌다 — 앞뒤 달의 날을 고르면 그 달로 넘어가야 하고,
  // 로빙 탭인덱스도 방금 고른 칸에 있어야 다음 방향키가 거기서 출발한다.
  //
  // ⚠️ **DOM 포커스는 옮기지 않는다.** 빠른 선택 칩을 누른 사람의 포커스를 그리드로 끌고 가면
  // 다음 Tab 이 어디서 출발할지 예측할 수 없다 — 머리말이 못 박은 「포커스는 키보드로 움직였을
  // 때만」의 연장이다.
  useEffect(() => {
    if (!open || value === "") return;
    setFocused(value);
    setViewMonth(startOfMonth(value));
  }, [open, value]);

  // `open` 도 의존성이다 — 지난번과 같은 날짜로 되돌아가 `focused` 가 그대로일 때도
  // 다시 열렸다는 사실만으로 포커스가 걸려야 한다.
  useEffect(() => {
    if (!moveFocusRef.current) return;
    moveFocusRef.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused, open]);

  const viewParsed = parseISO(viewMonth);
  const viewYear = viewParsed?.year ?? Number(today.slice(0, 4));
  const viewMonthNumber = viewParsed?.month ?? 1;
  const cells = monthGrid(viewMonth);
  const monthPrefix = viewMonth.slice(0, 7);

  /** 포커스 대상 날짜를 옮긴다. 달이 바뀌면 보이는 달도 따라간다. */
  function moveFocusTo(nextRaw: string, withDomFocus: boolean) {
    const next = clampISO(nextRaw, min, max);
    if (withDomFocus) moveFocusRef.current = true;
    setFocused(next);
    setViewMonth(startOfMonth(next));
  }

  /** ‹ › · 연·월 셀렉트 — 전부 「focused 를 N개월 옮긴다」로 표현된다(focused 는 항상 보이는 달 안에 있다). */
  function shiftMonths(amount: number) {
    moveFocusTo(addMonths(focused, amount), false);
  }

  /**
   * 날짜를 정한다. **닫지 않는다.**
   *
   * 🚨 [2026-08-30 사용자 지시] 종전엔 셀을 누르는 즉시 `onClose()` 가 따라 붙었다. 그러면
   * 잘못 누른 날을 고치려고 다시 열어야 하고, 「골랐다」는 사실을 그리드에서 확인할 틈도 없이
   * 패널이 사라진다(모바일에서는 손가락이 그 자리를 가리고 있어 더 그렇다). 이제 닫는 길은
   * **「닫기」 · Esc · 상자 밖 누르기** 셋뿐이다 — 닫기는 언제나 사용자가 정한다.
   *
   * 빠른 선택 칩도 같은 규칙을 쓴다. 「6개월 뒤」가 며칠인지는 눌러 봐야 알고, 그 확인이
   * 그리드에서 이뤄져야 한다.
   */
  function pick(iso: string) {
    if (!isWithinRange(iso, min, max)) return;
    onSelect(iso);
  }

  // 패널 전체의 키 처리. **JSX prop 이 아니라 imperative 리스너**인 이유가 둘이다 —
  //   ① `onKeyDown` 을 `<table>`·`<div>` 에 얹으면 접근성 린트가 「비대화형 요소에 키 리스너
  //      금지」로 막는다(실제로 막혔다). 날짜 셀 버튼마다 거는 방법도 있지만 그러면 연·월
  //      셀렉트에 포커스가 있을 때 Esc 가 듣지 않는다.
  //   ② 방향키는 **날짜 셀에 포커스가 있을 때만** 가로채야 한다. 그 판정을 실제 이벤트 대상
  //      (`data-date` 유무)으로 하면 셀렉트 안에서 ↑↓ 로 월을 고르는 네이티브 동작을 뺏지 않는다.
  // 의존성 배열을 두지 않아 렌더마다 다시 걸린다 — 항상 최신 `focused` 를 보는 가장 단순한 방법이고,
  // 패널이 열려 있는 동안에만 존재한다.
  useEffect(() => {
    const node = panelRef.current;
    node?.addEventListener("keydown", handleKeyDown);
    return () => node?.removeEventListener("keydown", handleKeyDown);
  });

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.dataset.date === undefined) return;
    const dayDelta = ARROW_DAY_DELTA[event.key];
    if (dayDelta !== undefined) {
      event.preventDefault();
      moveFocusTo(addDays(focused, dayDelta), true);
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      moveFocusTo(addMonths(focused, event.key === "PageUp" ? -1 : 1), true);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const weekday = cells.indexOf(focused) % DAYS_PER_WEEK;
      moveFocusTo(addDays(focused, event.key === "Home" ? -weekday : DAYS_PER_WEEK - 1 - weekday), true);
    }
  }

  const minYear = min === undefined || min === "" ? viewYear - YEAR_SPAN_BACK : Number(min.slice(0, 4));
  const maxYear = max === undefined || max === "" ? viewYear + YEAR_SPAN_FORWARD : Number(max.slice(0, 4));
  const years = Array.from({ length: Math.max(1, maxYear - minYear + 1) }, (_, index) => minYear + index);
  const visibleQuickPicks = (quickPicks ?? []).filter((option) => isWithinRange(option.value, min, max));
  // 그 달에 고를 수 있는 날이 하나도 없으면 이동 버튼을 막는다 — 눌러도 클램프로 제자리인 버튼을 남기지 않는다.
  const canGoPrev = isWithinRange(addDays(viewMonth, -1), min, max);
  const canGoNext = isWithinRange(addMonths(viewMonth, 1), min, max);

  return (
    <div ref={panelRef} className={PANEL}>
      {visibleQuickPicks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visibleQuickPicks.map((quick) => (
            <button key={quick.label} type="button" className={CHIP} onClick={() => pick(quick.value)}>
              {quick.label}
            </button>
          ))}
        </div>
      )}

      <div className={HEADER_ROW}>
        <button
          type="button"
          className={NAV_BUTTON}
          aria-label="이전 달"
          disabled={!canGoPrev}
          onClick={() => shiftMonths(-1)}
        >
          {/* 「‹」 같은 문자 글리프를 쓰지 않는다(D18) — 그 코드포인트는 Wanted Sans 의 어느
              unicode-range 조각에도 없어 OS 폰트로 폴백하고, 플랫폼마다 모양·폭이 달라진다.
              아래 화살표 아이콘을 돌려 쓴다(NumberInput 의 스피너가 쓰는 그 수법). */}
          <IconChevronDown size={16} className="rotate-90" />
        </button>
        {/* [D22] 둘 다 `text-base`(16px) 였다 — 요일 12px · 빠른 선택 칩 14px · 푸터 12px 인 이
            패널에서 **가장 덜 중요한 요소(월 이동 단축)가 가장 큰 글자**였다. `compact` 로 14px 로
            내린다. `<select>` 자신은 16px 그대로다(a11y.md §2.5, Select.tsx 머리말). */}
        <div className={JUMP_GROUP}>
          <Select
            size="compact"
            aria-label="연도"
            value={String(viewYear)}
            onValueChange={(next) => shiftMonths((Number(next) - viewYear) * MONTHS_PER_YEAR)}
            options={years.map((year) => ({ value: String(year), label: `${year}년` }))}
          />
          <Select
            size="compact"
            aria-label="월"
            value={String(viewMonthNumber)}
            onValueChange={(next) => shiftMonths(Number(next) - viewMonthNumber)}
            options={MONTH_NUMBERS.map((month) => ({ value: String(month), label: `${month}월` }))}
          />
        </div>
        <button
          type="button"
          className={NAV_BUTTON}
          aria-label="다음 달"
          disabled={!canGoNext}
          onClick={() => shiftMonths(1)}
        >
          <IconChevronDown size={16} className="-rotate-90" />
        </button>
      </div>

      {/* 그리드의 이름인 동시에, 보이는 달이 바뀐 사실을 알리는 live region 이다(WCAG 4.1.3).
          시각적으로는 위 셀렉트 두 개가 같은 사실을 이미 말하고 있어 화면에는 내지 않는다. */}
      <output id={labelId} className="sr-only">
        {`${String(viewYear)}년 ${String(viewMonthNumber)}월`}
      </output>

      {/* 진짜 `<table>` 이다 — `div` + role 로 흉내 내면 접근성 린트가 잡을 뿐 아니라(실제로
          잡혔다) 행·열 헤더 관계를 스크린리더가 스스로 읽어 주지 못한다.
          ⚠️ APG date picker 패턴의 `role="grid"` 는 **얹지 않았다** — 린트가 「비대화형 요소에
          대화형 role 금지」로 막는다. 대신 네이티브 표 시맨틱을 그대로 쓰고, 그 role 이 있어야만
          유효한 `aria-selected` 는 셀 버튼의 **접근명**으로 옮겼다(`date-cell-style.ts`). 키보드
          이동은 role 과 무관하게 아래 `onKeyDown` + 로빙 탭인덱스가 담당한다. */}
      <table ref={gridRef} aria-labelledby={labelId} className={GRID_TABLE}>
        <thead>
          <tr>
            {WEEKDAY_LABELS.map((label, index) => (
              <th
                key={label}
                scope="col"
                aria-label={`${label}요일`}
                className={index === 0 || index === DAYS_PER_WEEK - 1 ? WEEKDAY_CELL_WEEKEND : WEEKDAY_CELL}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
        {WEEK_START_INDEXES.map((start) => (
          <tr key={start}>
            {cells.slice(start, start + DAYS_PER_WEEK).map((iso, columnIndex) => {
              const isSelected = iso === value;
              const isMarked = markedDate !== undefined && iso === markedDate;
              return (
                <td key={iso} className="p-0.5">
                  <button
                    type="button"
                    data-date={iso}
                    disabled={!isWithinRange(iso, min, max)}
                    tabIndex={iso === focused ? 0 : -1}
                    aria-current={iso === today ? "date" : undefined}
                    aria-label={dateCellLabel(iso, {
                      isSelected,
                      isToday: iso === today,
                      markedLabel: isMarked ? markedLabel : undefined,
                    })}
                    className={dateCellClass({
                      isSelected,
                      isOutside: iso.slice(0, 7) !== monthPrefix,
                      isWeekend: columnIndex === 0 || columnIndex === DAYS_PER_WEEK - 1,
                      isToday: iso === today,
                      isMarked,
                    })}
                    onClick={() => pick(iso)}
                    onFocus={() => setFocused(iso)}
                  >
                    {Number(iso.slice(8, 10))}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
        </tbody>
      </table>

      <div className={FOOTER_ROW}>
        {onClear !== undefined && value !== "" && (
          <button type="button" className={FOOTER_BUTTON} onClick={onClear}>
            지우기
          </button>
        )}
        <button type="button" className={FOOTER_BUTTON} onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}

const ARROW_DAY_DELTA: Record<string, number | undefined> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -DAYS_PER_WEEK,
  ArrowDown: DAYS_PER_WEEK,
};
