// `GET /dashboard/summary` 응답 → 기존 프레젠테이션 컴포넌트(CategoryRow) props 변환.
//
// 교체 지점을 여기 하나로 모으는 이유는 `entities/wedding/model/sample-data.ts` 머리말이 이미
// 예견한 것과 같다 — "백엔드가 붙으면 이 파일이 사라지고 types.ts 만 남는다. 그때 교체 지점이
// 한 곳이어야 한다." CategoryRow 는 그대로 두고, 여기서만 API → 화면 타입을 잇는다.
//
// **`adaptBudgetSummary`는 여기 없다(UX 개편, 2026-08-26 제거)** — BudgetDonut이 예산 페이지로
// 옮겨가면서 대시보드는 더 이상 BudgetSummary를 조립하지 않는다. 예산 페이지는 같은 이름의
// 별개 함수 대신 `entities/wedding/model/derive-budget-summary.ts`(순수 계산, API 응답이 아니라
// `GET /wedding-categories`에서 파생)를 쓴다 — `pages/report/ui/adapt-report.ts`에도 동명 함수가
// 있는데 그건 S5 리포트 전용이라 서로 무관하다(헷갈리지 말 것).
import type { DashboardCategorySummary, DashboardSummary } from "@/entities/dashboard";
import type { CategoryBudget, WeddingHeadline } from "@/entities/wedding";

// **`budget: number | null` 의 `null`(「비용이 없는 카테고리」) 분기는 여기서 쓰지 않는다.**
// 그 개념은 구 sample-data(목업 `.no-cost`, 상견례)에만 있었고, 실제 `03_API_spec.md` #25 응답은
// `planned_budget` 을 모든 활성 카테고리에 대해 **항상 숫자**로 준다(개념적으로 "돈이 안 드는
// 카테고리"라는 구분이 백엔드에 없다) — CategoryRow 의 null 분기 코드 자체는 남겨 두되(다른 화면이
// 나중에 쓸 수 있음), 이 어댑터는 절대 null 을 만들지 않는다.
function toCategoryBudget(category: DashboardCategorySummary): CategoryBudget {
  return {
    id: category.category_code,
    name: category.name_ko,
    focus: category.tier === "FOCUS",
    budget: category.planned_budget,
    spent: category.paid_amount,
    checklistProgress: category.progress_rate,
  };
}

export function adaptCategories(categories: readonly DashboardCategorySummary[]): CategoryBudget[] {
  return categories.map((category) => toCategoryBudget(category));
}

const WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"] as const;

// API 는 `wedding_date` 를 ISO 문자열("2027-05-15")로만 준다 — `WeddingHeadline.dateLabel` 은
// "이미 사람이 읽는 형식으로 온다"고 가정하는 타입이라(구 sample-data 는 손으로 "2027년 3월 6일"을
// 채워 넣었다), 어댑터가 여기서 처음 포맷을 정한다. 요일까지 보이는 이유는 예식일처럼 한 번뿐인
// 날짜는 요일이 계획에 중요한 정보이기 때문 — 목업/HANDOFF 어디에도 규범이 없어 최소한으로만 더했다.
function formatWeddingDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  const weekday = WEEKDAY_LABEL[parsed.getDay()];
  return `${parsed.getFullYear()}년 ${parsed.getMonth() + 1}월 ${parsed.getDate()}일 (${weekday})`;
}

export function adaptHeadline(summary: DashboardSummary): WeddingHeadline {
  return {
    dDay: summary.d_day,
    dateLabel: formatWeddingDate(summary.wedding_date),
  };
}
