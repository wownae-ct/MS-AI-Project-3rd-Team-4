// `GET /reports/me`(#26) 응답을 기존 목업 기반 프레젠테이션 컴포넌트가 기대하는 prop 모양으로
// 바꾼다 — §5 `pages/dashboard/ui/adapt-summary.ts`와 같은 경계 격리 패턴이다. 컴포넌트 계약은
// 건드리지 않고 이 파일 하나로 실API 응답 ↔ 기존 타입 간극을 흡수한다.
import type { MyReport, ReportCategoryCompletion } from "@/entities/dashboard";
import type { WeddingCategory } from "@/entities/wedding";
import type { BudgetSummary, CategoryBudget, UpcomingPayment } from "@/entities/wedding";

/**
 * `budget_summary`에 `total_planned`이 없다(#26 스펙 원문 — total_budget/total_paid/
 * remaining_budget 셋뿐). `BudgetStats`는 애초에 `planned`을 쓰지 않지만(STATS 배열 참고)
 * `BudgetSummary` 타입 자체가 필수 필드로 요구하므로, 나머지 세 값으로 역산해 채운다
 * (total = paid + planned + remaining이 성립해야 하므로).
 */
export function adaptBudgetSummary(report: MyReport): BudgetSummary {
  const { total_budget, total_paid, remaining_budget } = report.budget_summary;
  return {
    total: total_budget,
    paid: total_paid,
    planned: total_budget - total_paid - remaining_budget,
    remaining: remaining_budget,
  };
}

/**
 * `category_completion`은 `{category_code, progress_rate}`뿐이라 이름·FOCUS 여부·예산 정보가
 * 없다 — `GET /wedding-categories`를 함께 불러 이름을 붙인다(카테고리명은 그 응답이 유일한
 * 출처이므로 별도 조회가 정당하다, 대시보드의 "응답 하나로 전부" 원칙과는 다른 경우).
 *
 * `checklistProgress`는 `progress_rate`(0~1)를 그대로 옮긴 값이다 — §2 결정(개수 대신 비율로
 * 통일)에 따라 `CategoryBudget` 타입 자체가 비율 하나만 받는다.
 */
export function adaptCategoryCompletions(
  completions: ReportCategoryCompletion[],
  weddingCategories: WeddingCategory[],
): CategoryBudget[] {
  const byCode = new Map(weddingCategories.map((category) => [category.category_code, category]));
  return completions.map((completion) => {
    const source = byCode.get(completion.category_code);
    return {
      id: completion.category_code,
      name: source?.name_ko ?? completion.category_code,
      focus: source?.tier === "FOCUS",
      budget: source?.planned_budget ?? null,
      spent: source?.paid_amount ?? 0,
      checklistProgress: completion.progress_rate,
    };
  });
}

/**
 * `next_recommended_checks`는 `{checklist_item_id, category_code, title, priority}`다 —
 * 기존 `RecommendedCheck`(source: SourceTier)와는 필드가 겹치지 않는다. `priority`(high/mid/low)를
 * `SourceTier`(OFFICIAL/CONSENSUS/INDUSTRY)로 억지 매핑하면 근거 출처 정보를 지어내는 것이 되므로,
 * §5의 `PaymentRow` 선례를 따라 `RecoRow`의 prop 계약 자체를 API가 실제로 주는 필드로 바꿨다
 * (RecoRow.tsx 머리말 참고).
 */
export function adaptUpcomingPayments(report: MyReport): UpcomingPayment[] {
  return report.upcoming_payments.map((payment) => ({
    id: payment.id,
    dDay: payment.d_day,
    item: payment.item_name,
    category: payment.category_code,
    date: payment.due_date,
    amount: payment.amount,
    // item_name엔 업체명이 안 붙는다(#22 스키마 — "스튜디오 잔금" 형태) — 옛 sample-data의
    // `item`(업체명 포함이라 폭 초과)과 달리 그대로 압축 라벨로 써도 폭이 맞는다.
    compactLabel: payment.item_name,
  }));
}
