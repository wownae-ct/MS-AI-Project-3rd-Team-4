// 총예산 입력 필드 — 2단계(Step2RegionBudget)와 8단계(Step8Allocation)가 공유한다.
//
// **왜 뽑아냈나(2026-08-28).** 8단계에서 카테고리 배분 합계가 총예산을 넘었을 때, 사용자가
// 2단계로 되돌아가지 않고 그 자리에서 총예산을 올릴 수 있어야 한다(사용자 지시). 그 입력이
// 2단계의 것과 미묘하게 다르면 — 스텝이 다르거나, 콤마가 다르거나, 만원↔원 반올림이 다르면 —
// 같은 값을 두 화면에서 다르게 보여주게 된다. 그래서 마크업을 복사하지 않고 한 곳에서 낸다.
//
// **원↔만원 변환이 이 파일 안에 있는 이유.** 호출부(2·8단계)와 그 부모(OnboardingPage)의
// `totalBudget` state 계약은 여전히 **원 단위 문자열**이다 — `POST /weddings` 가 원 단위
// 정수를 기대하고(03_API_spec.md #6), 컨테이너 state 의 의미를 바꾸면 제출 로직까지 번진다.
// 변환은 이 입력 경계에서만 일어난다: 사용자는 "4500"을 넣고 부모는 "45000000"을 받는다.
// 부수적으로 `OnboardingPage` 가 `@/shared/lib/money` 를 새로 import 하지 않아도 되게 한다 —
// 그 파일은 `import/max-dependencies`(10) 상한에 이미 닿아 있다(steps/index.ts 머리말 참조).
//
// 벤치마크 안내 문구 같은 **필드별 부속 설명은 `children` 으로 받는다** — 2단계에만 있고
// 8단계엔 없다(8단계는 "미정이에요" 토글과 지역 평균 문구를 빼기로 했다, 2026-08-28 사용자 지시).
//
// **입출력이 비대칭이다** — 표시값은 만원(`valueManwon`)으로 받고 되돌려주는 값은 원 단위
// 문자열이다. 호출부마다 "무엇을 보여줄지"를 정하는 규칙이 다르기 때문이다(2단계는 미정이면
// 벤치마크, 8단계는 배분 진행률의 분모). 그 규칙까지 이 안으로 들이면 화면별 분기가 여기 쌓인다.
import type { ReactNode } from "react";
import { AMOUNT_STEP_MANWON, manwonToWonString } from "@/shared/lib/money";
import { NumberInput } from "@/shared/ui";
import { FIELD_LABEL, INPUT, INPUT_DISABLED } from "../onboarding-styles";

export interface TotalBudgetFieldProps {
  /** 표시할 값(만원). **`null` 은 빈 칸**이다 — 0("0원으로 확정")과 다르다. */
  valueManwon: number | null;
  /** 입력값을 **원 단위 문자열**로 되돌린다 — 부모 state 와 `POST /weddings` 계약이 원 단위다. */
  onTotalBudgetChange: (wonString: string) => void;
  disabled?: boolean;
  /** 라벨 우측 슬롯 — 2단계의 "미정이에요" 미니 토글이 들어간다. 8단계는 주지 않는다. */
  labelAction?: ReactNode;
  /** 입력칸 아래 안내 문구. 2단계의 벤치마크/미정 캡션이 여기로 들어온다. */
  children?: ReactNode;
}

export function TotalBudgetField({
  valueManwon,
  onTotalBudgetChange,
  disabled = false,
  labelAction,
  children,
}: TotalBudgetFieldProps) {
  return (
    <div className={FIELD_LABEL}>
      <div className="flex items-center justify-between">
        총 예산
        {labelAction}
      </div>
      <div className="flex items-center gap-2">
        <NumberInput
          wrapClassName="min-w-0 flex-1"
          className={disabled ? INPUT_DISABLED : INPUT}
          step={AMOUNT_STEP_MANWON}
          min={0}
          aria-label="총 예산(만원)"
          value={valueManwon}
          disabled={disabled}
          onValueChange={(next) => {
            onTotalBudgetChange(manwonToWonString(next));
          }}
        />
        <span className="flex-none text-sm font-bold text-ink-soft">만원</span>
      </div>
      {children}
    </div>
  );
}
