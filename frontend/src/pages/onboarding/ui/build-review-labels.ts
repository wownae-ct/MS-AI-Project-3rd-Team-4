// 9단계(확인) 표시용 라벨 계산 — OnboardingPage.tsx에서 뽑아냈다(oxlint max-lines 300줄 상한
// 초과, 2026-08-26). 순수 함수라 훅/JSX 의존이 없다 — OnboardingPage는 원본 state에서 파생한
// "실제 제출될 값"만 이 함수에 넘기고, 결과를 그대로 Step9Review에 전달한다(단일 진실 공급원은
// 여전히 OnboardingPage — 이 파일은 그 값을 문자열로 바꾸는 표시 계층일 뿐이다).
import type { DoneSoFarCategory, SdmPriority, TastePreference, VenuePriority } from "@/entities/wedding";
import type { UnsurePrecision } from "./steps/Step1RoleDate";
import type { UnsurePrecisionOption } from "@/shared/lib/wedding-date";
import { PROGRESS_ITEMS, REGION_LABELS, SDM_CHIPS, TASTE_CARDS, VENUE_CHIPS } from "./steps";

export interface ReviewLabelInputs {
  isDateExact: boolean;
  weddingDate: string;
  unsurePrecision: UnsurePrecision;
  unsurePrecisionOptions: UnsurePrecisionOption[];
  regionCode: string;
  effectiveTotalBudgetUnsure: boolean;
  parsedTotalBudget: number;
  benchmarkMedianPrice: number | null;
  effectiveGuestCountUnsure: boolean;
  guestCount: string;
  effectiveTastePreference: TastePreference;
  effectiveGoals: string[];
  venuePriority: VenuePriority | null;
  sdmPriority: SdmPriority | null;
  doneSoFar: DoneSoFarCategory[];
  allocatedBudget: number;
  totalBudgetEstimate: number;
}

export interface ReviewLabels {
  weddingDateLabel: string;
  regionLabel: string;
  budgetLabel: string;
  guestCountLabel: string;
  tasteLabel: string;
  goalsLabel: string;
  venuePriorityLabel: string;
  sdmPriorityLabel: string;
  progressLabel: string;
  allocatedBudgetLabel: string;
}

function buildWeddingDateLabel(
  isDateExact: boolean,
  weddingDate: string,
  unsurePrecision: UnsurePrecision,
  unsurePrecisionOptions: UnsurePrecisionOption[],
): string {
  if (isDateExact) {
    return weddingDate === "" ? "날짜 미입력" : weddingDate;
  }
  if (unsurePrecision === "NO_PLAN") return "계획 없음";
  return unsurePrecisionOptions.find((option) => option.value === unsurePrecision)?.label ?? unsurePrecision;
}

export function buildReviewLabels(inputs: ReviewLabelInputs): ReviewLabels {
  const regionLabel = REGION_LABELS[inputs.regionCode as keyof typeof REGION_LABELS] ?? inputs.regionCode;
  const budgetLabel = inputs.effectiveTotalBudgetUnsure
    ? `미정 — ${regionLabel} 평균(${(inputs.benchmarkMedianPrice ?? 0).toLocaleString("ko-KR")}원)으로 시작해요`
    : `${inputs.parsedTotalBudget.toLocaleString("ko-KR")}원`;

  return {
    weddingDateLabel: buildWeddingDateLabel(
      inputs.isDateExact,
      inputs.weddingDate,
      inputs.unsurePrecision,
      inputs.unsurePrecisionOptions,
    ),
    regionLabel,
    budgetLabel,
    // 총예산과 달리 guest_count_unsure=true 일 때 서버가 대신 계산해 채워주는 값이 없다 —
    // "200명 기준으로 시작해요"는 실제로 저장되지 않는 값을 저장되는 것처럼 말해 어긋난다
    // (레드팀 감사 라운드 2).
    guestCountLabel: inputs.effectiveGuestCountUnsure ? "미정" : `${inputs.guestCount}명`,
    tasteLabel: TASTE_CARDS.find((card) => card.value === inputs.effectiveTastePreference)?.title ?? inputs.effectiveTastePreference,
    goalsLabel: inputs.effectiveGoals.join(", "),
    venuePriorityLabel:
      inputs.venuePriority === null
        ? "선택 안 함"
        : (VENUE_CHIPS.find((chip) => chip.value === inputs.venuePriority)?.label ?? inputs.venuePriority),
    sdmPriorityLabel:
      inputs.sdmPriority === null
        ? "선택 안 함"
        : (SDM_CHIPS.find((chip) => chip.value === inputs.sdmPriority)?.label ?? inputs.sdmPriority),
    progressLabel:
      inputs.doneSoFar.length === 0
        ? "아직 없어요"
        : PROGRESS_ITEMS.filter((item) => inputs.doneSoFar.includes(item.value))
            .map((item) => item.label)
            .join(", "),
    allocatedBudgetLabel: `${inputs.allocatedBudget.toLocaleString("ko-KR")}원 / ${inputs.totalBudgetEstimate.toLocaleString("ko-KR")}원`,
  };
}
