// "카테고리별 체크리스트 진행률" 카드 — DashboardPage.tsx에서 뽑아냈다. `import/max-
// dependencies`(10) 상한 때문이다 — PR #89(BudgetBenchmarkCard, 총예산 시세비교 카드)가
// 병합되며 DashboardPage.tsx의 임포트가 11개가 됐다.
//
// **시세비교가 빠졌다(2026-08-29, 사용자 지시)** — 이 카드는 `useCategoryBenchmarks`로
// `GET /categories` + `GET /benchmarks/compare`(카테고리마다)를 조회해 각 행에 시세 줄을
// 그렸다. 그 줄을 걷어내면서 조회도 함께 없앴다(홈 첫 로딩에서 요청 3개가 사라진다).
// 근거는 `CategoryRow.tsx` 머리말. 남은 일은 `summary.categories`를 행으로 바꿔 그리는 것뿐이라
// 이 컴포넌트에는 이제 상태도 effect도 없다.
import type { DashboardCategorySummary } from "@/entities/dashboard";
import { Card } from "@/shared/ui";
import { adaptCategories } from "./adapt-summary";
import { CategoryRow } from "./CategoryRow";

const ROWS = "flex flex-col";

export interface CategoryChecklistSectionProps {
  categories: readonly DashboardCategorySummary[];
}

export function CategoryChecklistSection({ categories: rawCategories }: CategoryChecklistSectionProps) {
  const categories = adaptCategories(rawCategories);

  return (
    <Card title="카테고리별 체크리스트 진행률">
      {categories.length === 0 ? (
        <p className="text-sm text-ink-soft">등록된 카테고리가 없습니다.</p>
      ) : (
        <div className={ROWS}>
          {categories.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </div>
      )}
    </Card>
  );
}
