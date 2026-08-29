// 날짜 입력칸의 마스크·캐럿 계산 — `shared/ui/DateField.tsx` 가 쓰는 순수 함수들.
// `number-input.ts` 와 같은 자리·같은 역할이다(DOM 없이 고정할 수 있는 "미묘하게 틀리기 쉬운"
// 계산만 떼어 둔다).
//
// **네이티브 `type="date"` 의 세그먼트 타이핑을 갚는 부분이다.** 데스크톱에서 `2026` `08` `29`
// 를 연달아 치면 브라우저가 칸을 옮겨 가며 받아 주는데, 그 감각을 잃지 않으려면 사용자가 숫자만
// 쳐도 `-` 가 알아서 끼어들어야 한다. 그래서 값의 진실은 **숫자 8자리**이고 표시 문자열은 거기서
// 파생된다 — `number-input.ts` 의 「콤마는 표시일 뿐」과 정확히 같은 구조다.

const MAX_DATE_DIGITS = 8; // YYYYMMDD
const YEAR_DIGITS = 4;
const MONTH_END = 6; // YYYYMM 까지의 자릿수

/** 무엇이 들어오든 숫자만, 8자리까지. 붙여넣은 `2026. 8. 29.` · `2026/08/29` 가 그대로 통과한다. */
export function toDateDigits(raw: string): string {
  return raw.replaceAll(/[^0-9]/gu, "").slice(0, MAX_DATE_DIGITS);
}

/**
 * 숫자열 → 표시 문자열. `"202608"` → `"2026-08"`.
 *
 * **부분 입력에도 구분자를 붙인다.** 4자리를 친 순간 `-` 가 나타나야 다음이 월이라는 것이
 * 보이고, 그게 네이티브 세그먼트 UI 가 하던 안내다. 다만 **막 4번째/6번째 자리를 친 직후에는
 * 뒤따르는 `-` 를 아직 붙이지 않는다** — 붙이면 지우려고 백스페이스를 눌렀을 때 구분자만
 * 지워지고 숫자가 그대로 남아 "지워지지 않는" 것처럼 느껴진다(그 한 번을 삼키게 된다).
 */
export function formatDateDigits(digits: string): string {
  const year = digits.slice(0, YEAR_DIGITS);
  const month = digits.slice(YEAR_DIGITS, MONTH_END);
  const day = digits.slice(MONTH_END);
  if (month === "") return year;
  if (day === "") return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

/** 표시 문자열 → 숫자열. 마스크를 되감는다. */
export function unformatDate(text: string): string {
  return toDateDigits(text);
}

/**
 * 캐럿 재계산 — 포맷 전 캐럿 앞의 **숫자 개수**를 받아 포맷 후 문자 인덱스를 돌려준다.
 * 구분자가 끼어들면 문자 인덱스가 밀리므로 숫자 개수를 기준으로 삼는다
 * (`number-input.ts` 의 `caretAfterFormat` 과 같은 이유·같은 계약).
 */
export function caretAfterDateFormat(formatted: string, digitsBeforeCaret: number): number {
  if (digitsBeforeCaret <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (formatted[index] === "-") continue;
    seen += 1;
    if (seen === digitsBeforeCaret) return index + 1;
  }
  return formatted.length;
}

/** 8자리를 다 채웠는가 — 이때만 값을 부모로 올린다(그 전에는 아직 날짜가 아니다). */
export function isCompleteDateDigits(digits: string): boolean {
  return digits.length === MAX_DATE_DIGITS;
}
