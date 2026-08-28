// BudgetDonut(S6)·BudgetStats(S5) 가 함께 쓰는 `BudgetSummary{total,paid,scheduled,allocated,
// unallocated}`(4분류)를 `GET /wedding-categories` 응답에서 순수 계산으로 파생한다 — 새 API
// 호출 없음. S5/S6 둘 다 이 함수를 직접 호출한다(중복 계산이 아니라 **같은 함수를 공유**해야
// 두 화면이 다시 다른 정의로 갈라지지 않는다 — red-bug.md #7의 근본 원인이었다).
//
// **버그 수정을 겸한다(3분류 시절부터 이어짐).** 예전(대시보드) 도넛은 `GET /dashboard/summary`의
// `total_planned`(=배정 총액, planned_budget 합)을 "계획(미지급)" 라벨로 그렸다. 그런데
// `planned_budget`은 `paid_amount`를 이미 포함한다(카테고리별로 `planned_budget >= paid_amount`가
// 서버에서 강제된다) — 그래서 `paid + total_planned`가 거의 항상 `total`을 넘어 "미배정" 구간이
// 클램프(Math.min(...,100))에 걸려 사실상 절대 그려지지 않았다.
//
// **4분류(2026-08-28)** — 예전 "계획(미지급)"이 "배정만 해두고 아직 결제 항목이 없는 금액"과
// "결제 항목은 만들었지만 아직 결제 전(PLANNED)인 금액"을 한 필드에 뭉쳐 뒀던 것 자체가 S5/S6가
// "미배정"을 다른 정의로 계산하던 버그의 근본 원인이었다(S5는 `report.budget_summary`를
// 지불액 기준으로 역산, S6는 배정액 기준 — 같은 웨딩인데 "미배정"이 달라 보였다). 이제 네
// 계열이 서로 배타적으로 나뉘어 합이 정확히 `total`이 된다:
//   지불완료(paid) + 지불예정(scheduled) + 배정(배정 - 지불 - 지불예정) + 미배정(총예산 - 배정) = 총예산
import type { BudgetSummary, WeddingCategory } from "./types";

export function deriveBudgetSummary(categories: readonly WeddingCategory[], totalBudget: number): BudgetSummary {
  const active = categories.filter((category) => category.is_active);
  const paid = active.reduce((sum, category) => sum + category.paid_amount, 0);
  const scheduled = active.reduce((sum, category) => sum + category.scheduled_amount, 0);
  const totalAllocated = active.reduce((sum, category) => sum + category.planned_budget, 0);
  return {
    total: totalBudget,
    paid,
    scheduled,
    // 데이터 이상(paid+scheduled가 planned_budget을 넘는 레코드)이 와도 음수로 내려가지 않게
    // 한다 — 정상 상태에서는 항상 0 이상이다(planned_budget >= paid_amount는 서버가 강제하지만
    // scheduled_amount까지 포함한 초과는 강제하지 않는다, 예전 "계획(미지급)" 클램프와 같은 이유).
    allocated: Math.max(0, totalAllocated - paid - scheduled),
    // 총예산을 배정 총액보다 낮게 낮추면 음수가 될 수 있다 — `PATCH /weddings/me`는 이 관계를
    // 검증하지 않는다(`PUT /wedding-categories`만 검증한다). BudgetDonut이 이미 0으로 클램프한다.
    unallocated: totalBudget - totalAllocated,
  };
}
