// "예산 현황"(도넛) + "카테고리별 배정" 묶음 — BudgetPage.tsx에서 뽑아냈다. 파일 크기 게이트가
// 아니라 **모듈 의존성 상한**(`import/max-dependencies`, 10개) 때문이다 — CostManagementTab
// 추가로 BudgetPage.tsx의 import가 11개가 됐다. 두 카드 다 "지금 얼마를 어디에 배정했는지"라는
// 같은 질문에 답하는 화면이라(도넛=전체 요약, 배정 목록=카테고리별 상세) 묶는 것 자체도 자연스럽다.
import type { BudgetBenchmarkSummary } from "@/entities/dashboard";
import type { BenchmarkComparison } from "@/entities/payment";
import type { WeddingCategory } from "@/entities/wedding";
import { deriveBudgetSummary } from "@/entities/wedding";
import { Card } from "@/shared/ui";
import { BudgetDonut } from "./BudgetDonut";
import { CategoryAllocationRow } from "./CategoryAllocationRow";

export interface AllocationOverviewProps {
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
  /** 총예산 vs 지역 시세 — 대시보드에서 옮겨온 것(UX 개편 3차, 2026-08-26, 사용자 지시).
      카테고리별이 아니라 웨딩 전체 단위라 위 hasBenchmarkByCode/benchmarkByCode(카테고리별)와는
      별개 데이터다 — BudgetPage가 getDashboardSummary()로 따로 조회해 내려준다. */
  budgetBenchmark: BudgetBenchmarkSummary | null;
  isEditingScenario: boolean;
  onDraftChange: (categoryCode: string, plannedBudget: number) => void;
  onTotalBudgetSaved: (nextTotal: number) => void;
}

export function AllocationOverview({
  rows,
  originalCategories,
  totalBudget,
  hasCostByCode,
  hasBenchmarkByCode,
  benchmarkByCode,
  budgetBenchmark,
  isEditingScenario,
  onDraftChange,
  onTotalBudgetSaved,
}: AllocationOverviewProps) {
  return (
    <>
      {/* 대시보드에 있던 도넛을 이 화면으로 옮겼다(UX 개편 2차, 2026-08-26) — deriveBudgetSummary가
          draft-aware한 rows를 받으므로, 시나리오 편집 중 슬라이더를 움직이면 도넛도 같이
          움직인다(entities/wedding/model/derive-budget-summary.ts 머리말 — 예전 대시보드
          도넛의 "미배정이 거의 항상 안 그려지던" 버그도 여기서 함께 고쳐졌다).
          UX 개편 3차(2026-08-26)로 대시보드의 "예산 시세 비교" 카드도 여기 흡수됐다 —
          BudgetDonut이 자기 Card(제목 "예산 현황" + titleAction 수정 버튼)를 직접 그리므로
          여기서는 더 이상 Card로 감싸지 않는다. */}
      <BudgetDonut
        summary={deriveBudgetSummary(rows, totalBudget)}
        onTotalBudgetSaved={onTotalBudgetSaved}
        benchmark={budgetBenchmark}
      />

      <Card title="카테고리별 배정">
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
    </>
  );
}
