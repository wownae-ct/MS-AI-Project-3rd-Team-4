// 원↔만원 변환 — `pages/onboarding`(Step2/Step6)과 `pages/budget`이 공유한다(2026-08-24).
//
// 처음엔 pages/onboarding/ui/ 안에 두려 했으나, pages/budget이 그걸 import하면 `.oxlintrc.json`의
// 「pages는 다른 pages 슬라이스를 못 넘본다」 규칙(layers.md §4.2)을 정면으로 어긴다. shared에는
// 슬라이스가 없고 lib 세그먼트는 "다른 모듈이 필요로 하는 라이브러리 코드"라는 공식 정의 그대로라
// (layers.md §1) 여기가 맞는 자리다.
//
// 모든 소비자는 여전히 원 단위 값을 저장/전송한다 — `POST /weddings`/`PUT /wedding-categories`가
// 원 단위 정수를 기대하므로(03_API_spec.md), 이 유틸은 입력 경계에서만 만원 단위로 보여주고
// 원 단위로 되돌린다. 원 단위 미만 정밀도는 화면 표시용이라 반올림하며, 실제 웨딩 예산 데이터에
// 1만원 미만 단수가 존재하는 경우는 없다(가격은 항상 1,000원 단위 이상 — seed_price_benchmarks.py
// 확인).

/**
 * 원 단위 문자열(빈 문자열 허용) → 만원 단위 숫자. **빈 칸은 `null`** 이다.
 *
 * 반환이 문자열이 아니라 숫자인 이유(2026-08-28) — 입력 경계가 `<input type="number">` 에서
 * `NumberInput` 으로 바뀌면서 값을 숫자로 주고받게 됐다. 빈 칸을 `""` 로 표현하던 예전 계약은
 * "아직 안 정함"과 "0만원으로 정함"이 구분되지 않는 자리를 만들어 `null` 로 옮겼다.
 */
export function wonStringToManwon(wonString: string): number | null {
  if (wonString === "") return null;
  const won = Number(wonString);
  if (Number.isNaN(won)) return null;
  return wonToManwon(won);
}

/** 만원 단위 숫자(빈 칸은 `null`) → 원 단위 문자열. 부모 state에 그대로 저장한다. */
export function manwonToWonString(manwon: number | null): string {
  return manwon === null ? "" : String(manwonToWon(manwon));
}

/** 원 단위 숫자 → 만원 단위 숫자. 이미 파싱된 number를 다루는 곳(Step6/BudgetPage)에서 쓴다. */
export function wonToManwon(won: number): number {
  return Math.round(won / 10_000);
}

/** 원 단위 숫자 → 만원 단위로 올림. STEP 12 — 슬라이더 하한처럼 "이 금액 아래로는 절대 못
 * 내려간다"는 값을 만원 단위로 맞출 땐 반올림(wonToManwon)이 아니라 올림이어야 한다 —
 * 반올림은 실결제액(예: 1,234,567원)을 1,230,000원처럼 실제보다 낮게 내림할 수 있어,
 * 그 값이 저장되면 이미 지급한 금액 아래로 예산이 내려가는 모순이 생긴다. */
export function wonToManwonCeil(won: number): number {
  return Math.ceil(won / 10_000);
}

/** 만원 단위 숫자 → 원 단위 숫자. */
export function manwonToWon(manwon: number): number {
  return manwon * 10_000;
}

/**
 * 원 단위 숫자 → **콤마 붙은** 만원 단위 표시 문자열. 단위("만원")는 붙이지 않는다 —
 * 호출부가 "만원 초과 지불"처럼 뒤에 말을 잇는 자리가 있어서다.
 *
 * `Money` 를 쓰지 않는 이유는 단위가 "원"이 아니라 "만원"이라서다. 그래도 콤마 규칙은
 * 같아야 한다 — 같은 화면에서 4,500만원(입력칸)과 4500만원(옆 문구)이 섞이면
 * 둘이 다른 값처럼 보인다(shared/ui/README 규범 6의 만원 판).
 */
export function formatManwon(won: number): string {
  return wonToManwon(won).toLocaleString("ko-KR");
}

/**
 * 숫자 입력의 ↑↓·▲▼ 1회 증감폭.
 *
 * 예전 `<input type="number">` 는 step 을 안 주면 1씩 올렸다 — 원 단위 칸에서 1원, 만원 단위
 * 칸에서 1만원이다. 앞엣것은 실질적으로 쓸 수 없는 기능이었다(50,000원을 만들려면 5만 번).
 * 스텝을 복원하면서 **의미 있는 단위로 올렸다**(2026-08-28 사용자 결정).
 */
export const AMOUNT_STEP_WON = 10_000;
/** 만원 단위 칸의 스텝 = 10만원. Step8Allocation 이 쓰던 `BUDGET_STEP_MANWON` 이 이 값이었다. */
export const AMOUNT_STEP_MANWON = 10;
