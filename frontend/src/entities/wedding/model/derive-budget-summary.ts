// BudgetDonut(3계열 도넛)이 필요로 하는 `BudgetSummary{total,paid,planned,remaining}`을
// `GET /wedding-categories` 응답에서 순수 계산으로 파생한다 — 새 API 호출 없음.
//
// **버그 수정을 겸한다.** 예전(대시보드) 도넛은 `GET /dashboard/summary`의 `total_planned`
// (=배정 총액, planned_budget 합)을 "계획(미지급)" 라벨로 그렸다. 그런데 `planned_budget`은
// `paid_amount`를 이미 포함한다(카테고리별로 `planned_budget >= paid_amount`가 서버에서
// 강제된다) — 그래서 `paid + total_planned`가 거의 항상 `total`을 넘어 "미배정" 구간이
// 클램프(Math.min(...,100))에 걸려 사실상 절대 그려지지 않았다.
//
// 여기서는 세 계열을 서로 배타적으로 나눠 합이 정확히 `total`이 되게 한다:
//   집행(paid) + 계획·미지급(배정 - 집행) + 미배정(총예산 - 배정) = 총예산
import type { BudgetSummary, WeddingCategory } from "./types";

export function deriveBudgetSummary(categories: readonly WeddingCategory[], totalBudget: number): BudgetSummary {
  const active = categories.filter((category) => category.is_active);
  const paid = active.reduce((sum, category) => sum + category.paid_amount, 0);
  const allocated = active.reduce((sum, category) => sum + category.planned_budget, 0);
  return {
    total: totalBudget,
    paid,
    // 데이터 이상(paid_amount가 planned_budget을 넘는 레코드)이 와도 음수로 내려가지 않게 한다 —
    // 정상 상태에서는 항상 0 이상이다(위 불변식 때문).
    planned: Math.max(0, allocated - paid),
    // 총예산을 배정 총액보다 낮게 낮추면 음수가 될 수 있다 — `PATCH /weddings/me`는 이 관계를
    // 검증하지 않는다(`PUT /wedding-categories`만 검증한다). BudgetDonut이 이미 0으로 클램프한다.
    remaining: totalBudget - allocated,
  };
}
