// `GET /reports/me`(#26) 응답을 기존 목업 기반 프레젠테이션 컴포넌트가 기대하는 prop 모양으로
// 바꾼다 — §5 `pages/dashboard/ui/adapt-summary.ts`와 같은 경계 격리 패턴이다. 컴포넌트 계약은
// 건드리지 않고 이 파일 하나로 실API 응답 ↔ 기존 타입 간극을 흡수한다.
//
// **`adaptBudgetSummary`는 여기 없다(2026-08-28 제거, red-bug.md #7 근본 수정).** 예전엔
// `report.budget_summary`(paid/remaining만 있는 3값)를 역산해 `BudgetSummary`를 조립했는데,
// 그 역산 정의가 S6(`deriveBudgetSummary`, 배정액 기준)와 달라서 같은 웨딩의 "미배정"이 두
// 화면에서 다르게 보이는 게 버그였다. `ReportPage.tsx`는 이제 S6와 똑같이
// `deriveBudgetSummary(weddingCategories, report.budget_summary.total_budget)`를 직접 호출한다
// — `report.budget_summary`는 `total_budget` 하나만 쓴다(`total_paid`/`remaining_budget`은
// 더 이상 쓰지 않는다, 어차피 `weddingCategories`로 다시 계산하므로).
import type { ReportCategoryCompletion } from "@/entities/dashboard";
import type { WeddingCategory } from "@/entities/wedding";

/**
 * S5 전용 카테고리 진행률 — `entities/wedding`의 `CategoryBudget.checklistProgress`(S2)와
 * 일부러 다른 타입이다. 2026-08-28부터 `progress_rate`의 산출 기준이 타임라인으로 바뀌면서
 * (`ReportPage.tsx` 머리말 참고) S2/S5가 서로 다른 값을 갖게 됐다 — 같은 필드명을 재사용하면
 * "같은 값의 다른 뷰"라는 낡은 전제를 코드가 계속 주장하는 꼴이 된다. `CategoryBudget`은
 * `budget`/`spent`/`focus`도 갖지만 `CompletionRow`는 이름과 진행률만 그리므로 여기서는
 * 필요한 세 필드만 둔다.
 */
export interface ReportCategoryProgress {
  id: string;
  name: string;
  /** 타임라인 준비 진행률(0~1 비율). API가 실제 개수가 아니라 비율만 준다 — 화면이 표시
      시점에 그 비율을 그대로 반올림한다(개수처럼 보이는 분모를 지어내지 않는다). */
  timelineProgress: number;
}

/**
 * `category_completion`은 `{category_code, progress_rate}`뿐이라 이름이 없다 — `GET
 * /wedding-categories`를 함께 불러 이름을 붙인다(카테고리명은 그 응답이 유일한 출처이므로
 * 별도 조회가 정당하다, 대시보드의 "응답 하나로 전부" 원칙과는 다른 경우). FOCUS 여부·예산
 * 정보는 `CompletionRow`가 그리지 않으므로 여기서 옮기지 않는다(`ReportCategoryProgress` 참고).
 *
 * `timelineProgress`는 `progress_rate`(0~1)를 그대로 옮긴 값이다 — 필드명만 다를 뿐 API
 * 계약(0~1 비율)은 그대로다. 값의 **출처**가 체크리스트에서 타임라인으로 바뀐 것은 백엔드
 * 쪽 변경이라(`get_timeline_progress_by_category()`) 이 어댑터는 관여하지 않는다.
 */
export function adaptCategoryCompletions(
  completions: ReportCategoryCompletion[],
  weddingCategories: WeddingCategory[],
): ReportCategoryProgress[] {
  const byCode = new Map(weddingCategories.map((category) => [category.category_code, category]));
  return completions.map((completion) => {
    const source = byCode.get(completion.category_code);
    return {
      id: completion.category_code,
      name: source?.name_ko ?? completion.category_code,
      timelineProgress: completion.progress_rate,
    };
  });
}
