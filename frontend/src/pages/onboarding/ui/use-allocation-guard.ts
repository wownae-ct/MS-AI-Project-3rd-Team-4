// 8단계 배분 초과 가드 — OnboardingPage.tsx에서 뽑아냈다(oxlint max-lines 300줄 상한 초과,
// 2026-08-28). `use-onboarding-data.ts`·`build-review-labels.ts`와 같은 이유·같은 방식이다.
//
// ## 무엇을 막는가
//
// 카테고리 배분 합계가 총예산을 넘어도 예전엔 아무것도 막히지 않았다. 8단계는 "N원 초과"라는
// 텍스트 한 줄만 바꾸고 "다음"을 그대로 통과시켰고, 그 값이 `POST /weddings` 의
// `planned_budget` 으로 나가 서버가 **400 BUDGET_EXCEEDED** 를 냈다
// (`sum(planned_budget) > total_budget`, backend services/wedding.py:300 — `is_active` 무관).
// 사용자는 온보딩을 끝까지 채우고 "시작하기"를 눌러야 그 사실을 알았고, 10단계 확인 화면은
// "5,000만원 / 4,000만원"으로 나란히 찍을 뿐 "초과"라는 말조차 하지 않아 어디를 고쳐야 하는지도
// 알 수 없었다.
//
// ## 술어를 여기가 소유하는 이유
//
// "다음"을 막는 조건(OnboardingPage)과 초과 문구를 띄우는 조건(Step8Allocation)이 갈리면
// "문구는 없는데 다음이 안 눌리는" 상태가 생긴다. `isOverAllocated` 를 한 곳에서 내고 양쪽이
// 그것만 보게 한다.
import { useState, type Dispatch, type SetStateAction } from "react";
// 배럴(`./steps`)이 아니라 정의 파일에서 직접 가져온다 — 그 배럴이 이 파일을 다시 재수출하므로
// (OnboardingPage의 import 상한 때문에, steps/index.ts 머리말 참조) 배럴을 거치면 import 순환이 된다.
import type { AllocationRow } from "./steps/Step7CategoryToggle";

export interface AllocationGuardDeps {
  /** 활성 카테고리 배분 합계(원). */
  allocatedBudget: number;
  /** 비교 기준(원) — 미정이면 벤치마크 중앙값이 들어온다. */
  totalBudgetEstimate: number;
  setAllocationRows: Dispatch<SetStateAction<AllocationRow[]>>;
  /** 원 단위 문자열. OnboardingPage의 `totalBudget` state 계약 그대로다. */
  setTotalBudget: (wonString: string) => void;
  setTotalBudgetUnsure: (unsure: boolean) => void;
  /** 10단계(확인)로 이동. 스텝 번호를 이 훅이 알 필요는 없다. */
  goToReview: () => void;
}

export interface AllocationGuard {
  isOverAllocated: boolean;
  /** 초과 상태로 "나중에 설정"을 눌러 배분 금액이 전부 0으로 되돌아갔다(10단계가 이 사실을 알린다). */
  wasAllocationReset: boolean;
  handleAllocationRowsChange: (next: AllocationRow[]) => void;
  handleTotalBudgetChange: (wonString: string) => void;
  handleSkipToReview: () => void;
}

export function useAllocationGuard({
  allocatedBudget,
  totalBudgetEstimate,
  setAllocationRows,
  setTotalBudget,
  setTotalBudgetUnsure,
  goToReview,
}: AllocationGuardDeps): AllocationGuard {
  const [wasAllocationReset, setWasAllocationReset] = useState(false);
  const isOverAllocated = allocatedBudget > totalBudgetEstimate;

  return {
    isOverAllocated,
    wasAllocationReset,

    // 7·8단계의 행 변경은 전부 이 래퍼를 지난다 — 배분을 다시 만진 순간 "지웠어요" 안내는
    // 사실이 아니게 된다.
    handleAllocationRowsChange: (next) => {
      setWasAllocationReset(false);
      setAllocationRows(next);
    },

    // 8단계 인라인 총예산 수정 — 숫자를 직접 넣는 순간 "미정"이 아니다.
    //
    // 🚨 여기서 플래그를 내리지 않으면 payload가 `total_budget: undefined` +
    // `total_budget_unsure: true`로 나가 **방금 입력한 금액이 통째로 버려진다**(서버가 벤치마크로
    // 다시 채운다, 03_API_spec.md #6 규칙 4). 사용자는 화면에서 초과가 사라지는 것을 보고
    // 고쳤다고 믿는데 실제로는 안 고쳐진 채 저장되는 — 이 가드가 닫으려는 바로 그 부류의 유실이다.
    handleTotalBudgetChange: (wonString) => {
      setTotalBudgetUnsure(false);
      setTotalBudget(wonString);
    },

    // "나중에 설정"의 목적지는 항상 10단계(확인)다. 다만 초과 상태를 그대로 들고 가면 10단계
    // "시작하기"가 곧바로 400을 맞는다 — 그래서 넘어가기 전에 배분 금액만 0으로 되돌린다
    // (2026-08-28 사용자 결정). `isActive`/`selectedOptions`는 건드리지 않는다: 그건 7단계에서
    // 내린 별개의 결정이고, "예산 배분은 나중에"가 "카테고리 선택도 취소"를 뜻하지는 않는다.
    //
    // 지워진다는 사실은 두 번 알린다 — 누르기 전(8단계 초과 블록의 보조 문구)과 누른 뒤
    // (10단계 ALLOCATION_RESET_NOTE). 조용히 지우면 10단계의 "0원 배분"이 버그로 읽힌다.
    //
    // 이 처리 덕분에 10단계에 도달하는 두 경로(8단계 "다음" — 초과면 막힘, 그 뒤 9단계 자유
    // 서술은 예산을 건드리지 않는다 / "나중에 설정" — 초과면 초기화)가 모두 초과 아님을
    // 보장한다. 9·10단계엔 금액 입력이 없으므로 "시작하기"에는 별도 가드를 달지 않는다
    // (도달 불가능한 코드가 된다).
    handleSkipToReview: () => {
      if (isOverAllocated) {
        setAllocationRows((rows) => rows.map((row) => ({ ...row, plannedBudget: 0 })));
        setWasAllocationReset(true);
      }
      goToReview();
    },
  };
}
