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
const H2_START_MONTH_INDEX = 6; // 0-indexed: 6 = 7월(Jul), 즉 하반기 시작월

function isSecondHalf(date: Date): boolean {
  return date.getMonth() >= H2_START_MONTH_INDEX;
}

/** 오늘 기준 반년 뒤가 속한 반기를 판정한다. "미정" 칩의 기본 선택값에 쓴다. */
export function computeDefaultUnsurePrecision(today: Date): HalfYearGuess {
  const target = new Date(today.getFullYear(), today.getMonth() + MONTHS_PER_HALF_YEAR, 1);
  return target.getFullYear() === today.getFullYear() ? "APPROX_H2_THIS_YEAR" : "APPROX_H1_NEXT_YEAR";
}

export interface UnsurePrecisionOption {
  value: "APPROX_H2_THIS_YEAR" | "APPROX_H1_NEXT_YEAR" | "APPROX_H2_NEXT_YEAR" | "APPROX_H1_YEAR_AFTER_NEXT";
  label: string;
}

const YEAR_MOD_FOR_LABEL = 100; // "28년" 처럼 두 자리만 쓴다.

// 2026-08-26 사용자 결정: "미정" 칩은 항상 "오늘이 속한 반기 다음부터 연속 3개 반기"를 보여준다
// — 오늘이 상반기면 올해 하반기·내년 상반기·내년 하반기, 오늘이 하반기면 내년 상반기·내년
// 하반기·그다음해 상반기.
//
// 세 번째 값(그다음해 상반기, `APPROX_H1_YEAR_AFTER_NEXT`)은 2026-08-26 이 함수를 만들며 처음
// 요청한 백엔드 enum 확장이다 — 같은 날 dev-4a 세션이 반영 완료(로컬 브랜치 `backend-bug-fix`,
// 아직 미병합)를 보고해 이 함수도 맞춰 갱신했다. 배포된 백엔드가 이 값을 아직 못 받는 동안은
// 선택 후 제출 시 422가 날 수 있다 — 병합/배포 여부는 이 함수가 알 수 없으니 확인은 호출부 몫이다.
export function computeUnsurePrecisionOptions(today: Date): UnsurePrecisionOption[] {
  if (!isSecondHalf(today)) {
    return [
      { value: "APPROX_H2_THIS_YEAR", label: "올해 하반기" },
      { value: "APPROX_H1_NEXT_YEAR", label: "내년 상반기" },
      { value: "APPROX_H2_NEXT_YEAR", label: "내년 하반기" },
    ];
  }
  const yearAfterNext = today.getFullYear() + 2;
  return [
    { value: "APPROX_H1_NEXT_YEAR", label: "내년 상반기" },
    { value: "APPROX_H2_NEXT_YEAR", label: "내년 하반기" },
    { value: "APPROX_H1_YEAR_AFTER_NEXT", label: `${(yearAfterNext % YEAR_MOD_FOR_LABEL).toString()}년 상반기` },
  ];
}
