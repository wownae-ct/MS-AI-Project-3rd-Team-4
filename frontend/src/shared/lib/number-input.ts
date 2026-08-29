// 숫자 입력의 정화·포맷·스텝 계산 — `shared/ui/NumberInput.tsx` 가 쓰는 순수 함수들.
//
// **왜 `<input type="number">` 를 버렸는가.** 두 가지가 동시에 걸렸다.
//
//   ① 콤마를 넣을 수 없다. HTML 스펙상 number 입력의 `value` 는 유효한 부동소수점 문자열이어야
//      하고, `"50,000"` 을 넣으면 브라우저가 통째로 빈 칸으로 만든다. 즉 「금액에 천 단위 콤마」는
//      이 타입을 쓰는 한 **구현이 불가능**하다. 반면 표시 쪽(`Money.tsx`)은 이미 콤마를 강제하고
//      있어서 "읽을 땐 45,000,000원인데 고치려고 누르면 45000000" 이 되는 표기 단절이 있었다.
//   ② 숫자만 받지 못한다. number 입력은 `-` `+` `.` `e` `E` 를 **전부 허용한다**. 이 저장소의
//      소비자는 전부 `Number()` 로 파싱해 그대로 서버에 보내므로(AddPaymentRow.tsx 등)
//      `-500` 이나 `1e9` 가 저장까지 갔다. `min={0}` 은 폼 제출 시 검증이라 입력을 막지 않는다.
//
// 대신 잃는 것(↑↓ 스텝, ▲▼ 스피너, spinbutton 시맨틱)은 하나도 남기지 않고 갚는다 — 그 계산이
// 이 파일이고, DOM 쪽 복원은 `NumberInput.tsx` 가 한다.
//
// 컴포넌트가 아니라 함수로 떼어 둔 이유는 `money.ts` 와 같다 — 테스트가 싸고, 캐럿·스텝처럼
// "미묘하게 틀리기 쉬운" 계산을 DOM 없이 고정할 수 있다.

/** 무엇이 들어오든 숫자만 남긴다. 마이너스·소수점·지수·통화기호·콤마·한글·전각숫자 전부 탈락. */
export function toDigits(raw: string): string {
  return raw.replaceAll(/[^0-9]/gu, "");
}

/**
 * 선행 0 정리. `"007"` → `"7"`.
 *
 * `0` 자체는 유효한 금액이라(예산 0원 배정) 통째로 지우지 않는다 — 지우면 사용자가 0을
 * 입력할 방법이 없어진다. 빈 문자열은 빈 문자열로 둔다(빈 칸 상태의 유일한 표현).
 */
export function normalizeDigits(digits: string): string {
  const trimmed = digits.replace(/^0+/u, "");
  if (trimmed !== "") return trimmed;
  return digits === "" ? "" : "0";
}

/**
 * 표시용 3자리 그룹핑. `"4500"` → `"4,500"`.
 *
 * ⚠️ `Money.tsx` 와 달리 `Intl.NumberFormat` 을 쓰지 않는다. 저쪽은 이미 파싱된 `number` 를
 * 받지만 여기는 **사용자가 타이핑/붙여넣기 중인 숫자 문자열**이라 `Number.MAX_SAFE_INTEGER`
 * 를 넘길 수 있다 — 20자리를 붙여넣으면 `Number()` 를 거치는 순간 뒷자리가 조용히 다른 숫자로
 * 바뀐다. 문자열을 문자열인 채로 끊으면 그 경로 자체가 없다.
 */
export function groupDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  return digits.replaceAll(/\B(?=([0-9]{3})+$)/gu, ",");
}

/**
 * 캐럿 재계산 — 포맷 전 캐럿 앞의 **숫자 개수**를 받아, 포맷 후 같은 개수 뒤의 문자 인덱스를 돌려준다.
 *
 * 캐럿을 문자 인덱스로 기억하면 콤마가 끼어드는 순간 한 칸씩 밀린다(`4500` 의 4번 위치가
 * `4,500` 에서는 5번이다). 콤마는 표시일 뿐이므로 **숫자 개수**를 기준으로 삼는다.
 *
 * 숫자가 줄어든 경우(삭제) 기억해 둔 개수가 남은 숫자보다 많을 수 있어 끝으로 접는다 —
 * 문자열 길이를 넘긴 값은 `setSelectionRange` 가 조용히 끝으로 잘라 주긴 하지만,
 * 여기서 명시적으로 접어 두면 호출부가 그 브라우저 동작에 기대지 않아도 된다.
 */
export function caretAfterFormat(formatted: string, digitsBeforeCaret: number): number {
  if (digitsBeforeCaret <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (formatted[i] === ",") continue;
    seen += 1;
    if (seen === digitsBeforeCaret) return i + 1;
  }
  return formatted.length;
}

/**
 * ↑↓ 키·▲▼ 버튼 1회 증감. `min`/`max` 로 클램프한다.
 *
 * **네이티브 `type="number"` 의 동작을 그대로 옮긴 것이다** — 현재값에 step 을 더하는 게 아니라
 * **다음 step 배수로 맞춘다**(Chrome 실측: value=7, step=10 → 10, 17이 아니다). 이 차이를
 * 무시하면 `Step8Allocation`(step 10만원)에서 4,507만원 같은 어중간한 값이 남아, 지금까지
 * 스텝으로 조절해 온 사용자에게는 회귀로 느껴진다.
 *
 * 빈 값(`null`)에서 ↑ 는 `max(min, step)`, ↓ 는 `min` — 이것도 네이티브와 같다.
 *
 * Shift 배수는 호출부가 `step` 을 부풀려 넘긴다. 이 함수는 그 사정을 모른다.
 */
export function stepValue(
  current: number | null,
  direction: 1 | -1,
  step: number,
  min: number,
  max?: number,
): number {
  let raw: number;
  if (current === null) {
    raw = direction > 0 ? Math.max(min, step) : min;
  } else if (direction > 0) {
    raw = Math.floor(current / step) * step + step;
  } else {
    raw = Math.ceil(current / step) * step - step;
  }
  const lower = Math.max(raw, min);
  return max === undefined ? lower : Math.min(lower, max);
}
