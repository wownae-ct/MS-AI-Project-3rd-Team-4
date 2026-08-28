// 9단계(신규, 2026-08-26 사용자 지시): 최종 확인 — 실제로 고른 값과, "나중에 설정"으로 남겨둬
// 기본값이 적용될 값을 한 화면에 모아 보여준다. 모든 단계의 "나중에 설정" 버튼이 다음 단계가
// 아니라 이 단계로 바로 이동한다(멀리 점프) — 몇 단계를 건너뛰었든 마지막엔 항상 여기서 전체를
// 확인하고 시작하게 한다.
//
// 이 컴포넌트는 상태도, 라벨 변환 로직도 갖지 않는다 — OnboardingPage가 원본 상태에서 파생한
// "실제 제출될 값"의 라벨을 그대로 내려주기만 한다. 라벨 계산을 여기서 다시 하면 이 화면이
// 보여주는 값과 실제로 POST /weddings에 나가는 값이 어긋날 여지가 생긴다 — 단일 진실 공급원을
// OnboardingPage 쪽에 둔다.
import { FIELD_NOTE } from "../onboarding-styles";

const SECTION = "flex flex-col gap-1 border-b border-line py-3 last:border-b-0 last:pb-0 first:pt-0";
const LABEL = "text-xs font-bold text-ink-soft";
const VALUE = "text-sm font-bold text-ink";
const DEFAULTED_NOTE = "나중에 설정을 선택해서, 저희가 정한 기본값으로 시작해요.";
// 예산 배분만 다른 문구를 쓴다 — 여기 0원은 "저희가 정한 기본값"이 아니라 **사용자가 넣었던
// 금액을 지운 결과**다(초과 상태로 "나중에 설정"을 누르면 OnboardingPage가 전부 0으로 되돌린다).
// 같은 문구를 재활용하면 "우리가 알아서 잡아줬다"로 읽혀 사용자가 지워진 사실을 모른 채 넘어간다.
// 8단계 초과 블록이 누르기 전에 한 번 경고하고, 이 문구가 누른 뒤 한 번 더 확인시킨다.
const ALLOCATION_RESET_NOTE = "총예산을 넘어서 배분 금액을 비웠어요. 시작한 뒤 예산 화면에서 다시 나눌 수 있어요.";

interface ReviewRowProps {
  label: string;
  value: string;
  isDefaulted?: boolean;
  /** `isDefaulted` 대신 쓸 문구. 주면 이 문자열이 기본 안내를 대체한다. */
  note?: string;
}

// 한때 하객 수만 문구를 바꿔치기하는 `defaultedNote` prop 이 있었다 — 서버가 guest_count 를
// NULL 로만 저장해 "기본값으로 시작해요"가 거짓이었기 때문이다. 2026-08-28부터 하객 수도 실제
// 기본값(200명)이 저장되므로 예외가 사라졌고, 그 prop 도 같이 걷어냈다(유일한 사용처였다).
//
// 같은 날 늦게 `note` 로 되돌아왔다. 이번 예외는 성격이 다르다 — 하객수 때는 **문구만** 사실과
// 달랐지만(값은 어차피 기본값이었다), 예산 배분 0원은 "저희가 정한 기본값"이 아니라 **사용자가
// 넣었던 값을 지운 결과**다. 두 사건을 한 문구로 덮으면 지워졌다는 사실 자체가 전달되지 않는다.
function ReviewRow({ label, value, isDefaulted, note }: ReviewRowProps) {
  const shown = note ?? (isDefaulted === true ? DEFAULTED_NOTE : null);
  return (
    <div className={SECTION}>
      <span className={LABEL}>{label}</span>
      <span className={VALUE}>{value}</span>
      {shown !== null && <p className={FIELD_NOTE}>{shown}</p>}
    </div>
  );
}

export interface Step9ReviewProps {
  weddingDateLabel: string;
  isDateDefaulted: boolean;
  regionLabel: string;
  budgetLabel: string;
  isBudgetDefaulted: boolean;
  guestCountLabel: string;
  isGuestCountDefaulted: boolean;
  tasteLabel: string;
  isTasteDefaulted: boolean;
  goalsLabel: string;
  isGoalsDefaulted: boolean;
  venuePriorityLabel: string;
  sdmPriorityLabel: string;
  progressLabel: string;
  activeCategoryCount: number;
  totalCategoryCount: number;
  allocatedBudgetLabel: string;
  /** 초과 상태로 "나중에 설정"을 눌러 배분 금액이 전부 0으로 되돌아갔다(OnboardingPage). */
  isAllocationReset: boolean;
}

export function Step9Review({
  weddingDateLabel,
  isDateDefaulted,
  regionLabel,
  budgetLabel,
  isBudgetDefaulted,
  guestCountLabel,
  isGuestCountDefaulted,
  tasteLabel,
  isTasteDefaulted,
  goalsLabel,
  isGoalsDefaulted,
  venuePriorityLabel,
  sdmPriorityLabel,
  progressLabel,
  activeCategoryCount,
  totalCategoryCount,
  allocatedBudgetLabel,
  isAllocationReset,
}: Step9ReviewProps) {
  return (
    <div className="flex flex-col">
      <ReviewRow label="결혼 예정일" value={weddingDateLabel} isDefaulted={isDateDefaulted} />
      <ReviewRow label="지역" value={regionLabel} />
      <ReviewRow label="총 예산" value={budgetLabel} isDefaulted={isBudgetDefaulted} />
      <ReviewRow label="예상 하객 수" value={guestCountLabel} isDefaulted={isGuestCountDefaulted} />
      <ReviewRow label="웨딩 취향" value={tasteLabel} isDefaulted={isTasteDefaulted} />
      <ReviewRow label="이번 준비 목표" value={goalsLabel} isDefaulted={isGoalsDefaulted} />
      <ReviewRow label="예식장 우선순위" value={venuePriorityLabel} />
      <ReviewRow label="스드메 우선순위" value={sdmPriorityLabel} />
      <ReviewRow label="지금까지 진행 상황" value={progressLabel} />
      <ReviewRow label="사용할 카테고리" value={`${activeCategoryCount.toString()}개 / 총 ${totalCategoryCount.toString()}개`} />
      <ReviewRow
        label="예산 배분"
        value={allocatedBudgetLabel}
        note={isAllocationReset ? ALLOCATION_RESET_NOTE : undefined}
      />
    </div>
  );
}
