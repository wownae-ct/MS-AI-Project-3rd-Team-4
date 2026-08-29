// 온보딩 하단 내비게이션(이전 / 나중에 설정 / 다음·시작하기) — OnboardingPage.tsx에서 뽑아냈다
// (oxlint max-lines 300줄 상한 초과, 2026-08-28 `frontend`→`fix/frontend` 병합으로 다시 넘겼다:
// 9단계 자유 서술 추가와 배분 초과 가드가 같은 파일에서 만났다). `use-onboarding-data.ts`·
// `build-review-labels.ts`·`use-allocation-guard.ts`와 같은 이유·같은 방식이다.
//
// ⚠️ OnboardingPage는 `import/max-dependencies`(파일당 10개) 상한도 이미 꽉 차 있다 — 그래서 이
// 파일도 `./steps` 배럴을 통해 재수출한다(steps/index.ts 머리말과 같은 이유).
//
// **막는 조건을 여기가 소유하지 않는다.** `isDateDefaulted`는 부모의 파생값 블록이,
// `isOverAllocated`는 `useAllocationGuard`가 낸다 — 이 컴포넌트는 결과만 받아 버튼을 잠근다.
// 막는 조건과 이유를 띄우는 조건이 갈리면 "문구는 없는데 다음이 안 눌리는" 상태가 생긴다
// (Step8Allocation.tsx의 근거를 그대로 따른다).
import { Button } from "@/shared/ui";
import { TOTAL_STEPS, type Step } from "./step-copy";

export interface OnboardingNavProps {
  step: Step;
  /** 1단계에서 "정확한 날짜"를 고르고 값은 비운 상태. */
  isDateDefaulted: boolean;
  /** 8단계 배분 합계가 총예산을 넘은 상태. */
  isOverAllocated: boolean;
  isSubmitting: boolean;
  onBack: () => void;
  onNext: () => void;
  /** 10단계(확인)로 점프. 배분 초과면 배분 금액을 비우고 간다(§ handleSkipToReview). */
  onSkipToReview: () => void;
  onSubmit: () => void;
}

export function OnboardingNav({
  step,
  isDateDefaulted,
  isOverAllocated,
  isSubmitting,
  onBack,
  onNext,
  onSkipToReview,
  onSubmit,
}: OnboardingNavProps) {
  return (
    // flex-wrap — 세 버튼의 폭 합(이전 68 + 나중에 설정 95 + 다음 60 + 간격 24 ≈ 247px)이
    // 320px 기기의 카드 안쪽 폭(256px)에 여유 9px 로 겨우 들어간다. 폰트가 폴백(iOS 의 Apple SD
    // Gothic Neo)으로 먼저 그려지는 순간 그 9px 이 사라진다. 종전엔 그때 버튼 글자가 세로로
    // 접혔고(D19 §결함 ①), 이제는 줄을 바꿔 받는다. `justify-between` 은 한 줄에 다 들어갈 때의
    // 배치라 그대로 둔다.
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {step > 1 && (
          <Button variant="ghost" onClick={onBack}>
            <span aria-hidden="true">←</span> 이전
          </Button>
        )}
        {/* 모든 입력 단계(1~9)에 "나중에 설정"이 있다(2026-08-26 사용자 지시, 2026-08-28
            9단계 자유 서술 추가로 범위가 자연스럽게 넓어졌다) — 목적지는 항상 10단계(확인)다.
            몇 단계에서 눌렀든 남은 단계는 그냥 건너뛰고, 비워둔 필드는 10단계가 정한 기본값으로
            채워진다(OnboardingPage의 § isXxxDefaulted 파생값 블록) — "다음"으로 하나씩 넘기는
            것과 달리 여기선 중간 단계를 굳이 보여줄 필요가 없다.
            배분 초과 상태에서 누르면 배분 금액이 0으로 되돌아간다(§ handleSkipToReview). */}
        {step < TOTAL_STEPS && (
          <Button variant="ghost" onClick={onSkipToReview}>
            나중에 설정
          </Button>
        )}
      </div>
      {step < TOTAL_STEPS ? (
        <Button
          // 1단계에서 "정확한 날짜"를 고르고 값을 비운 채로는 다음으로 넘어가지 못하게 막는다
          // — "나중에 설정"은 여전히 열려 있다(그 경우 isDateDefaulted 파생값이 안전하게
          // 미정 취급한다). 값 없이 "다음"만 눌러 진행하면 결국 10단계 제출 시점에야 422로
          // 알게 되던 문제를 여기서 먼저 막는다(레드팀 감사).
          //
          // 8단계 배분 초과도 같은 이유로 막는다 — 그대로 두면 10단계 "시작하기"에서 400
          // BUDGET_EXCEEDED로 알게 된다. 여기서도 "나중에 설정"은 열려 있지만, 1단계와 달리
          // 그냥 통과시키지 않고 배분 금액을 비운다(§ handleSkipToReview) — 날짜와 달리
          // 초과 배분은 안전하게 기본값 처리할 방법이 없다.
          disabled={(step === 1 && isDateDefaulted) || (step === 8 && isOverAllocated)}
          onClick={onNext}
        >
          다음
        </Button>
      ) : (
        <Button disabled={isSubmitting} onClick={onSubmit}>
          시작하기
        </Button>
      )}
    </div>
  );
}
