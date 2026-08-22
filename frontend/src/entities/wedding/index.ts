// 웨딩 도메인 슬라이스 공개 API — 슬라이스 밖에서는 이 파일로만 접근한다.
//
// 데이터를 두 파일로 나눠 재수출한다. 나눈 이유는 `model/recommended-checks.ts` 머리말 참조 —
// 여기서 한 파일로 합치면 그 효과가 사라진다.
export type {
  BudgetSummary,
  CategoryBudget,
  RecommendedCheck,
  SourceTier,
  UpcomingPayment,
  WeddingHeadline,
} from "./model/types";
export { BUDGET, CATEGORY_BUDGETS, UPCOMING_PAYMENTS, WEDDING } from "./model/sample-data";
export { RECOMMENDED_CHECKS } from "./model/recommended-checks";
