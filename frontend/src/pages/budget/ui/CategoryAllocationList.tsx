// "카테고리별 예산 현황" 카드 — 예전 `AllocationOverview.tsx`에서 도넛과 한 덩어리로 묶여
// 있던 아래쪽 절반이다.
//
// **분리 이유(2026-08-29, 사용자 지시)** — 화면 배치가 「총 예산 현황(도넛) → 다가오는 결제 →
// 비용 관리 → 카테고리별 예산 현황」으로 바뀌면서, 도넛과 이 목록 **사이에** 다른 섹션이 끼게
// 됐다. 둘을 한 컴포넌트가 연달아 렌더하던 구조로는 그 순서를 만들 수 없어 파일을 갈랐다.
// (AllocationOverview는 원래 BudgetPage의 모듈 의존성 상한(`import/max-dependencies`, 10)을
// 넘기지 않으려고 만든 묶음이었다 — 갈라도 BudgetPage import는 정확히 10개로 한도 안이다.)
import type { BenchmarkComparison } from "@/entities/payment";
import type { WeddingCategory } from "@/entities/wedding";
import { Card } from "@/shared/ui";
import { CategoryAllocationRow } from "./CategoryAllocationRow";

export interface CategoryAllocationListProps {
  /** 보기 모드면 원본, 시나리오 편집 중이면 draft — BudgetPage가 이미 이 둘을 합쳐서 내려준다. */
  rows: readonly WeddingCategory[];
  /** originalAmount 계산 기준 — 항상 원본(draft 아님). draft 중에도 "저장 전 값"을 보여줘야 한다. */
  originalCategories: readonly WeddingCategory[];
  totalBudget: number;
  hasCostByCode: ReadonlyMap<string, boolean>;
  /** 시세비교 대상 여부/결과 — BudgetPage가 `useCategoryBenchmarks`로 한 번만 조회해 내려준다
      (2026-08-26, UX 개편 2차, 사용자 지시). 대시보드 `CategoryRow.tsx`와 같은 데이터. */
  hasBenchmarkByCode: ReadonlyMap<string, boolean>;
  benchmarkByCode: ReadonlyMap<string, BenchmarkComparison>;
  isEditingScenario: boolean;
  onDraftChange: (categoryCode: string, plannedBudget: number) => void;
}

export function CategoryAllocationList({
  rows,
  originalCategories,
  totalBudget,
  hasCostByCode,
  hasBenchmarkByCode,
  benchmarkByCode,
  isEditingScenario,
  onDraftChange,
}: CategoryAllocationListProps) {
  return (
    <Card title="카테고리별 예산 현황">
      <div>
        {rows.map((category) => {
          const hasCost = hasCostByCode.get(category.category_code) ?? true;
          const original = originalCategories.find((c) => c.category_code === category.category_code);
          const originalAmount = original?.planned_budget ?? category.planned_budget;
          return (
            <CategoryAllocationRow
              key={category.category_code}
              category={category}
              hasCost={hasCost}
              totalBudget={totalBudget}
              hasBenchmark={hasBenchmarkByCode.get(category.category_code) ?? false}
              benchmark={benchmarkByCode.get(category.category_code)}
              isEditingScenario={isEditingScenario}
              originalAmount={originalAmount}
              onDraftChange={onDraftChange}
            />
          );
        })}
      </div>
    </Card>
  );
}
