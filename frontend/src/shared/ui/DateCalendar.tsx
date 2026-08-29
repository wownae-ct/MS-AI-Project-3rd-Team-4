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
// ⚠️ **DOM 포커스는 키보드로 움직였을 때만 옮긴다.** 마운트 직후 1회는 옮긴다(열자마자 방향키가
// 들어야 한다). 그러나 ‹ › 버튼이나 연·월 셀렉트로 달을 바꿀 때 포커스까지 그리드로 끌고 가면
// **키보드 사용자가 ‹ 를 한 번 누른 뒤 그 버튼을 잃는다.** 그래서 `moveFocusRef` 로 갈랐다.
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
const JUMP_SELECT = "min-h-tap rounded-md border border-line bg-surface px-1.5 text-base text-ink";
const JUMP_GROUP = "flex flex-1 items-center justify-center gap-1";
const WEEKDAY_CELL = "h-8 text-xs font-bold text-ink-soft";
const WEEKDAY_CELL_WEEKEND = "h-8 text-xs font-bold text-ink";
/** `table-fixed` 가 7열을 같은 폭으로 나눈다 — 375px 폰에서 카드 안쪽 343px ÷ 7 = 49px. */
const GRID_TABLE = "w-full table-fixed border-collapse";
const CHIP =
  "min-h-tap rounded-pill border border-line bg-surface px-3 text-sm font-bold text-ink-soft " +
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
}: DateCalendarProps) {
  const today = todayISO();
  const [focused, setFocused] = useState(() => (value === "" ? clampISO(today, min, max) : value));
  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(value === "" ? clampISO(today, min, max) : value),
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLTableElement>(null);
  const moveFocusRef = useRef(true);

  useEffect(() => {
    if (!moveFocusRef.current) return;
    moveFocusRef.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused]);

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

  function pick(iso: string) {
    if (!isWithinRange(iso, min, max)) return;
    onSelect(iso);
    onClose();
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
        <div className={JUMP_GROUP}>
          <select
            className={JUMP_SELECT}
            aria-label="연도"
            value={viewYear}
            onChange={(event) => shiftMonths((Number(event.target.value) - viewYear) * MONTHS_PER_YEAR)}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}년
              </option>
            ))}
          </select>
          <select
            className={JUMP_SELECT}
            aria-label="월"
            value={viewMonthNumber}
            onChange={(event) => shiftMonths(Number(event.target.value) - viewMonthNumber)}
          >
            {MONTH_NUMBERS.map((month) => (
              <option key={month} value={month}>
                {month}월
              </option>
            ))}
          </select>
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
