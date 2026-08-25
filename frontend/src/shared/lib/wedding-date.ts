// 결혼예정일 "미정" 칩(온보딩 1단계)의 기본 선택값 계산 — money.ts와 같은 이유로 shared/lib에
// 둔다: pages/onboarding 안에 두면 다른 pages 슬라이스가 재사용할 때 `.oxlintrc.json`의
// 「pages는 다른 pages 슬라이스를 못 넘본다」 규칙(layers.md §4.2)에 걸린다.
//
// `UnsurePrecision`(pages/onboarding/ui/steps/Step1RoleDate.tsx) 타입을 import하지 않는 이유 —
// shared는 하향 레이어라 pages/entities를 import할 수 없다(layers.md §1). 대신 그 타입의 값 중
// 실제로 반환하는 2종을 이 파일이 직접 정의한다 — 문자열 리터럴이 그대로 일치하므로 호출부에서
// `UnsurePrecision`에 구조적으로 대입 가능하다.
//
// 반환값이 "내년 하반기"를 포함하지 않는 이유 — 오늘이 어느 달이든 정확히 6개월 뒤는 항상
// 「같은 해 하반기」(오늘이 상반기일 때) 또는 「다음 해 상반기」(오늘이 하반기일 때) 둘 중 하나로만
// 떨어진다(달 범위 0~11의 산술적 귀결). "내년 하반기" 칩 자체는 그대로 남아있고 사용자가 직접
// 고를 수 있다 — 이 함수가 만드는 건 그중 하나를 가리키는 기본값일 뿐이다.
export type HalfYearGuess = "APPROX_H2_THIS_YEAR" | "APPROX_H1_NEXT_YEAR";

const MONTHS_PER_HALF_YEAR = 6;

/** 오늘 기준 반년 뒤가 속한 반기를 판정한다. "미정" 칩의 기본 선택값에 쓴다. */
export function computeDefaultUnsurePrecision(today: Date): HalfYearGuess {
  const target = new Date(today.getFullYear(), today.getMonth() + MONTHS_PER_HALF_YEAR, 1);
  return target.getFullYear() === today.getFullYear() ? "APPROX_H2_THIS_YEAR" : "APPROX_H1_NEXT_YEAR";
}
