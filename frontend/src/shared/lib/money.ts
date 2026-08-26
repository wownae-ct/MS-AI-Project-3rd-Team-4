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

/** 원 단위 문자열(빈 문자열 허용) → 만원 단위 표시 문자열. 입력창에 그대로 넣는다. */
export function wonStringToManwonDisplay(wonString: string): string {
  if (wonString === "") return "";
  const won = Number(wonString);
  if (Number.isNaN(won)) return "";
  return String(Math.round(won / 10_000));
}

/** 사용자가 만원 단위로 입력한 문자열 → 원 단위 문자열. 부모 state에 그대로 저장한다. */
export function manwonInputToWonString(manwonInput: string): string {
  if (manwonInput === "") return "";
  const manwon = Number(manwonInput);
  if (Number.isNaN(manwon)) return "";
  return String(manwon * 10_000);
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
