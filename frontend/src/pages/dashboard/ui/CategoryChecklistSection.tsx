// "카테고리별 체크리스트 · 시세비교" 카드 — DashboardPage.tsx에서 뽑아냈다. `import/max-
// dependencies`(10) 상한 때문이다 — PR #89(BudgetBenchmarkCard, 총예산 시세비교 카드)가
// 병합되며 DashboardPage.tsx의 임포트가 11개가 됐다. CategoryRow 렌더 + useCategoryBenchmarks
// 조회를 한 컴포넌트로 묶는다 — 이 컴포넌트는 `summary`가 확정된 뒤에만 마운트되므로(호출부가
// early return 이후에 렌더), 예전 DashboardPage.tsx의 NO_CATEGORIES 안정 배열 우회가 필요 없다
// (Hooks 규칙은 "이 컴포넌트 안에서 무조건 호출"이지 "부모의 조건부 렌더 이전에 호출"이 아니다).
import type { DashboardCategorySummary } from "@/entities/dashboard";
import { Card } from "@/shared/ui";
import { adaptCategories } from "./adapt-summary";
import { CategoryRow } from "./CategoryRow";
import { useCategoryBenchmarks } from "./use-category-benchmarks";

const ROWS = "flex flex-col";

export interface CategoryChecklistSectionProps {
  categories: readonly DashboardCategorySummary[];
}

export function CategoryChecklistSection({ categories: rawCategories }: CategoryChecklistSectionProps) {
  const { hasBenchmarkByCode, benchmarkByCode } = useCategoryBenchmarks(rawCategories);
  const categories = adaptCategories(rawCategories);

  return (
    <Card title="카테고리별 체크리스트 · 시세비교">
      {categories.length === 0 ? (
        <p className="text-sm text-ink-soft">등록된 카테고리가 없습니다.</p>
      ) : (
        <div className={ROWS}>
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              hasBenchmark={hasBenchmarkByCode.get(category.id) ?? false}
              benchmark={benchmarkByCode.get(category.id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
