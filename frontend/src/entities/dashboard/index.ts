// dashboard 슬라이스 공개 API — 슬라이스 밖에서는 이 파일로만 접근한다.
export type {
  BudgetBenchmarkSummary,
  DashboardCategorySummary,
  DashboardSummary,
  DashboardUpcomingItem,
  MyReport,
  ReportBudgetSummary,
  ReportCategoryCompletion,
  ReportRecommendedCheck,
  ReportUpcomingPayment,
} from "./model";
export { getDashboardSummary, getMyReport } from "./api/dashboard";
