// 10단계(2026-08-26 사용자 지시로 신규 도입, 2026-08-28 9단계 자유 서술 추가로 9→10 재편):
// 최종 확인 — 실제로 고른 값과, "나중에 설정"으로 남겨둬 기본값이 적용될 값을 한 화면에 모아
// 보여준다. 모든 단계의 "나중에 설정" 버튼이 다음 단계가 아니라 이 단계로 바로 이동한다(멀리
// 점프) — 몇 단계를 건너뛰었든 마지막엔 항상 여기서 전체를 확인하고 시작하게 한다.
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
const GUEST_COUNT_DEFAULTED_NOTE = "나중에 설정을 선택해서, 인원 수는 미정으로 저장돼요.";

interface ReviewRowProps {
  label: string;
  value: string;
  isDefaulted?: boolean;
  // 대부분의 필드는 "나중에 설정"이 실제 기본값을 채워 넣지만(취향/목표 등), 하객 수는 서버가
  // NULL 로만 저장할 뿐 대신 채워주는 값이 없다 — 그 경우 공용 DEFAULTED_NOTE 문구("저희가
  // 정한 기본값으로 시작해요")가 실제 동작과 어긋난다(레드팀 감사 라운드 2). 필요한 행만
  // 이 prop 으로 문구를 바꿔치기한다.
  defaultedNote?: string;
}

function ReviewRow({ label, value, isDefaulted, defaultedNote }: ReviewRowProps) {
  return (
    <div className={SECTION}>
      <span className={LABEL}>{label}</span>
      <span className={VALUE}>{value}</span>
      {isDefaulted === true && <p className={FIELD_NOTE}>{defaultedNote ?? DEFAULTED_NOTE}</p>}
    </div>
  );
}

export interface Step10ReviewProps {
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
  customRequestLabel: string;
}

export function Step10Review({
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
  customRequestLabel,
}: Step10ReviewProps) {
  return (
    <div className="flex flex-col">
      <ReviewRow label="결혼 예정일" value={weddingDateLabel} isDefaulted={isDateDefaulted} />
      <ReviewRow label="지역" value={regionLabel} />
      <ReviewRow label="총 예산" value={budgetLabel} isDefaulted={isBudgetDefaulted} />
      <ReviewRow
        label="예상 하객 수"
        value={guestCountLabel}
        isDefaulted={isGuestCountDefaulted}
        defaultedNote={GUEST_COUNT_DEFAULTED_NOTE}
      />
      <ReviewRow label="웨딩 취향" value={tasteLabel} isDefaulted={isTasteDefaulted} />
      <ReviewRow label="이번 준비 목표" value={goalsLabel} isDefaulted={isGoalsDefaulted} />
      <ReviewRow label="예식장 우선순위" value={venuePriorityLabel} />
      <ReviewRow label="스드메 우선순위" value={sdmPriorityLabel} />
      <ReviewRow label="지금까지 진행 상황" value={progressLabel} />
      <ReviewRow label="사용할 카테고리" value={`${activeCategoryCount.toString()}개 / 총 ${totalCategoryCount.toString()}개`} />
      <ReviewRow label="예산 배분" value={allocatedBudgetLabel} />
      {/* 다른 스킵 가능 필드(취향/목표)와 달리 이 필드엔 "저희가 정한 기본값"이 없다 — 비우면
          그냥 null로 저장된다(하객 수와 같은 부류). isDefaulted 대신 라벨 자체("작성 안 함")로
          충분히 전달돼 별도 안내 문구가 필요 없다. */}
      <ReviewRow label="추가로 남긴 말" value={customRequestLabel} />
    </div>
  );
}
