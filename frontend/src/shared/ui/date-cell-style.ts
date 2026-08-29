// 캘린더 날짜 셀의 클래스와 접근명 — `DateCalendar.tsx` 에서 떼어냈다(파일당 300줄 상한).
//
// 클래스는 **완성된 리터럴**로만 고른다. Tailwind 스캐너는 소스를 평문으로 읽어 런타임 조립
// (`` `cell--${state}` ``)을 찾지 못하고, 그 경우 **빌드는 성공한 채 스타일만 사라진다**
// (shared/ui/README 「코드 규약」).
//
// 시각 값은 전부 팔레트 안이다 — 선택 = primary 알약, 오늘 = primary 테두리, 주말 = **색이 아니라
// 글자 무게**(D6 은 상태색을 지어내지 않기로 닫았다), 앞뒤 달 = ink-soft.
import { formatKorean } from "@/shared/lib/date";

// 셀은 44px 두 변을 채운다(min-h-tap 규범).
const CELL_BASE =
  "flex min-h-tap w-full items-center justify-center rounded-pill text-base text-ink " +
  "transition-colors duration-150 enabled:hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const CELL_WEEKEND =
  "flex min-h-tap w-full items-center justify-center rounded-pill text-base font-bold text-ink " +
  "transition-colors duration-150 enabled:hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const CELL_OUTSIDE =
  "flex min-h-tap w-full items-center justify-center rounded-pill text-base text-ink-soft " +
  "transition-colors duration-150 enabled:hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const CELL_SELECTED =
  "flex min-h-tap w-full items-center justify-center rounded-pill bg-primary text-base font-bold text-surface";
const CELL_TODAY_MARK = "border border-primary";
const CELL_REFERENCE_MARK = "underline";

export interface DateCellFlags {
  isSelected: boolean;
  isOutside: boolean;
  isWeekend: boolean;
  isToday: boolean;
  isMarked: boolean;
}

export function dateCellClass({ isSelected, isOutside, isWeekend, isToday, isMarked }: DateCellFlags): string {
  const base = isSelected ? CELL_SELECTED : isOutside ? CELL_OUTSIDE : isWeekend ? CELL_WEEKEND : CELL_BASE;
  const withToday = isToday && !isSelected ? `${base} ${CELL_TODAY_MARK}` : base;
  return isMarked ? `${withToday} ${CELL_REFERENCE_MARK}` : withToday;
}

/**
 * 셀 하나가 읽히는 말. 숫자만 읽으면 "15" 가 무슨 15인지 알 수 없다.
 *
 * 선택 여부를 `aria-selected` 가 아니라 **접근명에 넣는 이유** — 그 속성은 `role="gridcell"` 에서만
 * 유효한데, 접근성 린트가 `<table>` 에 `role="grid"` 를 얹는 것을 막는다(non-interactive 요소에
 * interactive role 금지). 네이티브 표 시맨틱(행·열 헤더 낭독)을 지키면서 선택 사실도 남기려면
 * 이름에 싣는 쪽이 확실하다 — 어떤 보조기기에서도 누락되지 않는다.
 */
export function dateCellLabel(
  iso: string,
  flags: { isSelected: boolean; isToday: boolean; markedLabel?: string },
): string {
  const parts = [formatKorean(iso)];
  if (flags.isToday) parts.push("오늘");
  if (flags.markedLabel !== undefined) parts.push(flags.markedLabel);
  if (flags.isSelected) parts.push("선택됨");
  return parts.join(" · ");
}
