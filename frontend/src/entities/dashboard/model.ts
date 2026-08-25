// 대시보드/리포트 응답 타입 — 03_API_spec.md #25/#26.
// 저장 모델이 없는 api-전용 슬라이스다(layers.md §2.1 의 report 슬라이스와 동일 패턴) —
// S2/S5 화면이 이 응답을 직접 소비하고 자체 스토어를 갖지 않는다.

export interface DashboardCategorySummary {
  category_code: string;
  name_ko: string;
  // 실측 enum(FOCUS|MOCKUP) 2값뿐이다(backend-analysis/06-deployed-contract.md, 3곳에서 확인) —
  // ETC 카테고리의 allows_custom_tag=true 를 tier 값으로 착각하기 쉬운데 별개 필드다.
  tier: "FOCUS" | "MOCKUP";
  is_active: boolean;
  planned_budget: number;
  paid_amount: number;
  progress_rate: number;
}

// discriminated union — source 로 timeline/checklist 두 변형을 구분한다.
//
// category_code 는 null 일 수 있다 — 온보딩 시 항상 생기는 카테고리 무관 "범용" 타임라인
// 항목(예: "결혼 날짜 후보 확정")이 이 값을 null 로 준다(레드팀 감사 라운드 2, HIGH). 예전엔
// non-nullable 로 선언돼 있어 컴파일 타임에도 안 걸러졌고, 화면에서 `?? item.category_code`
// 폴백이 `undefined ?? null` 이 돼 문자열 "null" 이 그대로 찍혔다.
export type DashboardUpcomingItem =
  | {
      source: "timeline";
      id: string;
      category_code: string | null;
      title: string;
      target_date: string;
      d_day: number;
    }
  | {
      source: "checklist";
      id: string;
      category_code: string | null;
      title: string;
      status: string;
    };

export interface DashboardSummary {
  wedding_date: string;
  d_day: number;
  total_budget: number;
  total_paid: number;
  total_planned: number;
  remaining_budget: number;
  categories: DashboardCategorySummary[];
  upcoming_items: DashboardUpcomingItem[];
}

export interface ReportBudgetSummary {
  total_budget: number;
  total_paid: number;
  remaining_budget: number;
}

export interface ReportCategoryCompletion {
  category_code: string;
  progress_rate: number;
}

export interface ReportUpcomingPayment {
  id: string;
  category_code: string;
  item_name: string;
  amount: number;
  due_date: string;
  d_day: number;
}

export interface ReportRecommendedCheck {
  checklist_item_id: string;
  category_code: string;
  title: string;
  // 문서(02-schemas.md #10)는 이 필드를 Literal 이 아니라 그냥 str 로 적는다 — 값을 지어내지 않는다.
  priority: string;
}

export interface MyReport {
  budget_summary: ReportBudgetSummary;
  category_completion: ReportCategoryCompletion[];
  upcoming_payments: ReportUpcomingPayment[];
  next_recommended_checks: ReportRecommendedCheck[];
}
