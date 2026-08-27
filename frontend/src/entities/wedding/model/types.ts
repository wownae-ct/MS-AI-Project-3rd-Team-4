// 웨딩 도메인 타입 — 화면이 아니라 **도메인**이 소유한다.
//
// 왜 entities 인가 — 목업 6개 중 **5개가 같은 값을 본다**: S2 대시보드(예산·납부·카테고리) ·
// S3 카테고리 상세(체크리스트 항목 + 근거 출처) · S4 타임라인(같은 항목명 4건 그대로) ·
// S5 리포트(같은 값의 다른 뷰) · S6 예산 재배분(12,000,000 · 8,000,000 · 10,000,000 · 6,500,000 ·
// 미배정 1,000,000 을 그대로 쓴다). `.oxlintrc.json` 이 `pages → pages` import 를 막으므로
// 화면 슬라이스에 두면 두 번째 화면부터 값을 복제하게 된다.
//
// **슬라이스를 하나로 두는 것은 취향이 아니라 규칙이다** — `.oxlintrc.json` 의 entities override 가
// *"entities는 상위 레이어와 다른 entity 슬라이스를 import할 수 없다"* 를 강제한다. `checklist` 를
// 따로 떼면 `category` 를 참조할 수 없어 `categoryId` 가 성립하지 않는다.
//
// 이 파일은 **타입만** 담는다. 백엔드가 붙으면 합성 데이터 파일들은 사라지고 여기는 남는다.

export interface BudgetSummary {
  /** 총예산 */
  total: number;
  /** 지불(완료) */
  paid: number;
  /** 계획(미지급) */
  planned: number;
  /** 미배정 — 아직 어느 카테고리에도 배정되지 않은 금액. **「남은 돈」이 아니다.** */
  remaining: number;
}


export interface CategoryBudget {
  id: string;
  name: string;
  /** 목업의 `FOCUS` 배지(s2:230,242). */
  focus: boolean;
  /**
   * 배정 예산. **`null` 은 「비용이 없는 카테고리」**다(목업의 `.no-cost`, s2:219).
   * 0 과 구분해야 한다 — 0 이면 "예산이 있는데 아직 안 썼다", null 이면 "돈이 드는 항목이 아니다".
   */
  budget: number | null;
  spent: number;
  /** 체크리스트 준비 진행률(0~1 비율). API가 실제 개수가 아니라 비율만 준다(§25) — 화면이
      표시 시점에 그 비율을 그대로 반올림한다(개수처럼 보이는 분모를 지어내지 않는다). */
  checklistProgress: number;
}

export interface WeddingHeadline {
  /** 예식일까지 남은 일수. 표시는 `D-{dDay}`. */
  dDay: number;
  /** 이미 사람이 읽는 형식으로 온다 — 여기서 날짜 포맷을 정하지 않는다(규범에 없다). */
  dateLabel: string;
}

// ── 아래부터는 백엔드 실연동(§2, local/frontend-e2e)을 위해 추가된 API 계약 타입.
// 03_API_spec.md #6/#7/#8/#9/#10/#31 응답·요청 스키마 그대로.

export type UserRole = "BRIDE" | "GROOM";
export type WeddingDatePrecision =
  | "EXACT"
  | "APPROX_H2_THIS_YEAR"
  | "APPROX_H1_NEXT_YEAR"
  | "APPROX_H2_NEXT_YEAR"
  // 2026-08-26 백엔드에 추가된 4번째 근사 버킷("오늘 기준 2년 뒤 해의 상반기") — dev-4a 세션이
  // `backend/app/schemas/wedding.py:14`(DatePrecision Literal)에 추가, 로컬 브랜치
  // `backend-bug-fix`(아직 미병합) 기준. `shared/lib/wedding-date.ts::computeUnsurePrecisionOptions`
  // 가 오늘이 하반기일 때의 세 번째 "미정" 칩에 이 값을 쓴다.
  | "APPROX_H1_YEAR_AFTER_NEXT"
  | "NO_PLAN";
export type TastePreference = "MINIMAL" | "BUDGET" | "GRAND" | "BALANCED";
export type VenuePriority = "FOOD" | "LOCATION" | "PARKING" | "CAPACITY";
export type SdmPriority = "DRESS" | "PHOTO" | "MAKEUP";
export type DoneSoFarCategory = "MEETING" | "VENUE" | "SDM";

export interface WeddingCreateInput {
  user_role: UserRole;
  wedding_date?: string;
  wedding_date_precision: WeddingDatePrecision;
  total_budget?: number;
  total_budget_unsure: boolean;
  region_code: string;
  guest_count?: number;
  guest_count_unsure: boolean;
  taste_preference?: TastePreference;
  venue_priority?: VenuePriority;
  sdm_priority?: SdmPriority;
  primary_goals?: string[];
  done_so_far?: DoneSoFarCategory[];
  /** 2026-08-27 재설계 — 온보딩 개인화 LLM 생성을 웨딩당 한 번만 태우기 위해 카테고리
      활성/예산 배분을 생성 시점에 함께 보낸다(이전엔 생성 직후 PUT /wedding-categories를
      또 호출해 활성 카테고리가 바뀔 때마다 개인화가 두 번 트리거됐다 — 실측 Langfuse
      p95=45.9초짜리 호출이 온보딩마다 두 번 겹쳤다). `PUT /wedding-categories`(별도
      putWeddingCategories 호출)는 온보딩 이후 수정 전용으로 남는다. */
  categories: WeddingCategoryUpdateInput[];
}

export type WeddingUpdateInput = Partial<
  Pick<WeddingCreateInput, "wedding_date" | "wedding_date_precision" | "total_budget" | "region_code" | "guest_count">
>;

/** POST /weddings 응답은 categories를 포함하지 않는다(카테고리는 GET /wedding-categories로
    별도 조회) — WeddingCreateInput의 요청 전용 필드를 응답 타입에서 제외한다. */
export interface WeddingProfile extends Omit<WeddingCreateInput, "categories"> {
  id: string;
  created_at: string;
}

// 실측 enum(FOCUS|MOCKUP) 2값뿐이다 — `dashboard/model.ts`의 `DashboardCategorySummary.tier`와
// 동일 근거(backend-analysis/06-deployed-contract.md). 스캐폴드 원본의 CUSTOM은 근거 없이
// 추가된 3번째 값이라 제외한다.
export type CategoryTier = "FOCUS" | "MOCKUP";

export interface WeddingCategory {
  category_code: string;
  name_ko: string;
  tier: CategoryTier;
  is_active: boolean;
  planned_budget: number;
  paid_amount: number;
  remaining: number;
  selected_options: string[] | null;
  display_order: number;
  has_benchmark: boolean;
  has_vendor_cases: boolean;
}

export interface WeddingCategoriesResponse {
  categories: WeddingCategory[];
}

export interface WeddingCategoryUpdateInput {
  category_code: string;
  is_active: boolean;
  planned_budget: number;
  selected_options?: string[] | null;
  skip_reason?: string;
  display_order: number;
}

export interface TotalAverageBenchmark {
  region_code: string;
  survey_month: string;
  median_price: number;
  min_price: number;
  max_price: number;
  sample_count: number;
  source_url: string;
}

// #11 GET /categories(03_API_spec.md:244-257) — 개별 웨딩과 무관한 카테고리 상수. 온보딩 6단계
// (카테고리별 예산 배분)가 이 응답으로 행을 그린다. **7개를 하드코딩하지 않는다** — 목업
// (s1-onboarding.html:365-373)은 HOMENEW 추가(v4.0) 이전에 얼어붙어 7행뿐이지만 실제 ENUM은
// 9개다(CLAUDE.md, `04_DB_spec.md` §3). `has_cost=false`인 카테고리(현재는 MEETING)만 "비용
// 없음"으로 표시해야 그 판단도 하드코딩이 아니라 서버 값을 따른다.
export interface CategoryConstant {
  code: string;
  name_ko: string;
  display_order: number;
  tier: CategoryTier;
  has_cost: boolean;
  has_benchmark: boolean;
  has_vendor_cases: boolean;
  allows_custom_tag: boolean;
}

export interface CategoriesResponse {
  categories: CategoryConstant[];
}
