// 날짜 계산·표시의 단일 출처 — `shared/ui/DateField.tsx` · `DateCalendar.tsx` 가 쓰는 순수 함수들.
//
// **왜 문자열(ISO `YYYY-MM-DD`)이 이 모듈의 기본 단위인가.** 이 앱이 다루는 날짜는 전부
// 「달력의 하루」이지 시각이 아니다(`wedding_date` · `target_date` · `due_date` · `paid_date`).
// 백엔드 계약도 전부 ISO 날짜 문자열이고, `group-by-phase.ts` 는 이미 *"target_date 가 전부 ISO
// YYYY-MM-DD 라 사전식 비교가 곧 시간순"* 이라는 사실 위에 정렬을 얹어 두었다. `Date` 객체를
// 값으로 들고 다니면 그 순간부터 시:분:초와 시간대가 따라붙어, 「같은 날인가」를 묻는 모든
// 비교가 미묘하게 틀릴 수 있는 계산이 된다. 그래서 `Date` 는 **이 파일 안에서 달력 산술을 할
// 때만** 쓰고 밖으로 내보내지 않는다.
//
// ## 🚨 UTC 를 쓰지 않는다 — 이 파일이 고치는 실제 버그
//
// 종전 `PaymentListRow.tsx` 의 오늘 날짜 계산은 `new Date().toISOString().slice(0, 10)` 이었다.
// `toISOString()` 은 **UTC** 라, KST(UTC+9)의 00:00~08:59 에는 어제 날짜를 돌려준다 — 새벽에
// 「이미 결제했어요」를 켠 사용자에게 어제가 결제일로 찍힌다. 아래 `todayISO()` 는 로컬 달력
// 필드(`getFullYear`/`getMonth`/`getDate`)만 읽어 그 경로 자체를 없앤다.
//
// 같은 이유로 문자열 → `Date` 변환도 `new Date("2026-08-29")`(UTC 자정으로 해석된다)가 아니라
// `new Date(y, m - 1, d)`(로컬 자정)를 쓴다.

/** 캘린더 헤더와 `formatKorean` 이 함께 쓰는 요일 이름. 인덱스는 `Date.getDay()` 와 같다(0=일). */
export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 일요일 시작 6주 고정 그리드의 칸 수. 달마다 행 수가 달라지면 패널 높이가 출렁인다. */
export const MONTH_GRID_LENGTH = 42;

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;

export interface CalendarDate {
  year: number;
  /** 1~12. `Date` 의 0-based 월과 헷갈리지 않도록 사람이 쓰는 번호로 둔다. */
  month: number;
  day: number;
}

function pad2(value: number): string {
  return value < 10 ? `0${String(value)}` : String(value);
}

/** `Date` 의 **로컬** 달력 필드만 읽어 ISO 로. UTC 로 새는 경로가 여기 하나도 없다(머리말 §UTC). */
function fromLocalDate(date: Date): string {
  return toISO({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
}

/** 로컬 달력 기준 오늘. 인자는 테스트가 고정된 날짜를 넣기 위한 것이다. */
export function todayISO(now: Date = new Date()): string {
  return fromLocalDate(now);
}

export function toISO({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/**
 * 실존하는 날짜만 통과시킨다 — 서식(`2026-13-01`)뿐 아니라 **달력에 없는 날**(`2026-02-30`)도
 * 거른다. `Date` 는 그런 값을 조용히 다음 달로 넘겨 버리므로(2026-02-30 → 3월 2일) 되돌려
 * 비교해 확인한다. 통과하지 못하면 `null` — 예외를 던지지 않는다(입력 중인 값이 여기로 온다).
 */
export function parseISO(iso: string): CalendarDate | null {
  if (!ISO_PATTERN.test(iso)) return null;
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;
  return { year, month, day };
}

export function isValidISO(iso: string): boolean {
  return parseISO(iso) !== null;
}

/** 내부 전용 — 유효한 ISO 를 로컬 자정 `Date` 로. 호출 전에 `parseISO` 로 걸러야 한다. */
function toLocalDate(iso: string): Date {
  const parsed = parseISO(iso);
  if (parsed === null) throw new Error(`유효하지 않은 날짜: ${iso}`);
  return new Date(parsed.year, parsed.month - 1, parsed.day);
}

/** 0=일요일. 유효하지 않은 값에는 `null`. */
export function weekdayIndex(iso: string): number | null {
  return isValidISO(iso) ? toLocalDate(iso).getDay() : null;
}

/**
 * 사람이 읽는 형태 — `"2027년 5월 15일 (토)"`.
 *
 * 요일을 괄호로 함께 내는 것이 이 서식의 존재 이유다. 결혼식·상견례·본식 잔금처럼 이 앱이
 * 다루는 날짜는 **요일이 곧 의미**인데, 네이티브 `type="date"` 의 표시에는 요일이 없었다.
 * `Intl.DateTimeFormat` 을 쓰지 않는다 — 로케일이 브라우저·OS 설정에 달려 있어 같은 화면이
 * 기기마다 다르게 보인다(그 편차를 없애는 것이 자체 입력으로 옮긴 이유 중 하나다).
 */
export function formatKorean(iso: string): string {
  const parsed = parseISO(iso);
  if (parsed === null) return "";
  const weekday = WEEKDAY_LABELS[toLocalDate(iso).getDay()];
  return `${String(parsed.year)}년 ${String(parsed.month)}월 ${String(parsed.day)}일 (${weekday})`;
}

/**
 * `to - from` 을 일 단위로. 둘 다 로컬 자정이라 서머타임이 없는 KST 에서는 정확히 나누어
 * 떨어지지만, 서머타임이 있는 지역에서 열어도 하루가 23/25시간이 되는 날이 섞이므로 `round`
 * 로 접는다(`group-by-phase.ts` 가 같은 이유로 같은 처리를 한다).
 */
export function diffDays(from: string, to: string): number | null {
  if (!isValidISO(from) || !isValidISO(to)) return null;
  return Math.round((toLocalDate(to).getTime() - toLocalDate(from).getTime()) / MS_PER_DAY);
}

export function addDays(iso: string, amount: number): string {
  if (!isValidISO(iso)) return iso;
  const base = toLocalDate(iso);
  base.setDate(base.getDate() + amount);
  return fromLocalDate(base);
}

/**
 * 달을 옮긴다. **말일은 옮긴 달의 말일로 접는다** — `1월 31일 + 1개월` 은 `2월 28일` 이다.
 * `Date.setMonth` 에 맡기면 3월 3일로 넘어가 버려, 「한 달 뒤」를 고른 사용자가 다음 달을
 * 건너뛴 날짜를 받는다.
 */
export function addMonths(iso: string, amount: number): string {
  const parsed = parseISO(iso);
  if (parsed === null) return iso;
  const movedMonthIndex = parsed.month - 1 + amount;
  const year = parsed.year + Math.floor(movedMonthIndex / 12);
  const month = ((movedMonthIndex % 12) + 12) % 12 + 1;
  const lastDay = new Date(year, month, 0).getDate();
  return toISO({ year, month, day: Math.min(parsed.day, lastDay) });
}

/** 그 달의 1일. 캘린더가 「지금 보고 있는 달」을 이 형태로 들고 다닌다. */
export function startOfMonth(iso: string): string {
  const parsed = parseISO(iso);
  if (parsed === null) return iso;
  return toISO({ ...parsed, day: 1 });
}

/**
 * 일요일 시작 6주 고정 그리드. 앞뒤 달의 날짜로 채워 항상 42칸을 돌려준다.
 *
 * 실제 달에 속하는 칸인지는 호출부가 `iso.slice(0, 7)` 비교로 판정한다 — 여기서 플래그 객체를
 * 만들어 돌려주면 렌더마다 42개의 객체가 새로 생긴다.
 */
export function monthGrid(monthStartISO: string): string[] {
  const parsed = parseISO(monthStartISO);
  if (parsed === null) return [];
  const first = new Date(parsed.year, parsed.month - 1, 1);
  const gridStart = new Date(parsed.year, parsed.month - 1, 1 - first.getDay());
  return Array.from({ length: MONTH_GRID_LENGTH }, (_, index) => {
    const cell = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    return fromLocalDate(cell);
  });
}

/** 사전식 비교로 충분하다 — 전부 같은 자릿수의 ISO 문자열이다. */
export function isWithinRange(iso: string, min?: string, max?: string): boolean {
  if (min !== undefined && min !== "" && iso < min) return false;
  return !(max !== undefined && max !== "" && iso > max);
}

export function clampISO(iso: string, min?: string, max?: string): string {
  if (min !== undefined && min !== "" && iso < min) return min;
  if (max !== undefined && max !== "" && iso > max) return max;
  return iso;
}

export interface DateQuickPick {
  label: string;
  value: string;
}

/**
 * 앞으로의 날짜를 고르는 칸(납부 예정일 · 타임라인 항목)의 빠른 선택.
 *
 * 「오늘이 며칠인지부터 계산해야 하는」 단계를 없애는 것이 목적이라 상대 표현만 넣는다.
 * 범위(min/max) 밖으로 나가는 항목은 `DateField` 가 렌더 단계에서 거른다 — 여기서 범위를
 * 알 필요가 없다.
 */
export function futureQuickPicks(today: string): DateQuickPick[] {
  return [
    { label: "오늘", value: today },
    { label: "1주 뒤", value: addDays(today, DAYS_PER_WEEK) },
    { label: "1개월 뒤", value: addMonths(today, 1) },
  ];
}

/** 이미 지난 날짜를 고르는 칸(결제일)의 빠른 선택 — 영수증을 보며 입력하는 자리다. */
export function pastQuickPicks(today: string): DateQuickPick[] {
  return [
    { label: "오늘", value: today },
    { label: "어제", value: addDays(today, -1) },
  ];
}
