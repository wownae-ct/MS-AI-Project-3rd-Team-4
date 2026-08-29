// "카테고리별 예산 현황" 카드 — 예전 `AllocationOverview.tsx`에서 도넛과 한 덩어리로 묶여
// 있던 아래쪽 절반이다.
//
// **분리 이유(2026-08-29, 사용자 지시)** — 화면 배치가 「총 예산 현황(도넛) → 다가오는 결제 →
// 비용 관리 → 카테고리별 예산 현황」으로 바뀌면서, 도넛과 이 목록 **사이에** 다른 섹션이 끼게
// 됐다. 둘을 한 컴포넌트가 연달아 렌더하던 구조로는 그 순서를 만들 수 없어 파일을 갈랐다.
// (AllocationOverview는 원래 BudgetPage의 모듈 의존성 상한(`import/max-dependencies`, 10)을
// 넘기지 않으려고 만든 묶음이었다 — 갈라도 BudgetPage import는 정확히 10개로 한도 안이다.)
//
// **비활성 카테고리 제외(2026-08-29, 레드팀 감사 #21, 사용자 결정)** — 온보딩에서 끈 카테고리가
// 이 목록에만 활성과 똑같은 모습으로 남아 있었다. 대시보드(`GET /dashboard/summary`)와 타임라인
// (`GET /timeline-items`)은 서버가 비활성을 걸러서 주는데, 이 화면이 쓰는
// `GET /wedding-categories`만 9개 전체를 준다 — 그래서 거르는 일이 프론트 몫이다.
//
// ⚠️ **거르는 곳이 여기여야 한다.** BudgetPage 가 넘겨주는 `rows` 를 그쪽에서 미리 걸러 버리면
// 같은 배열을 쓰는 `plannedTotal`(총예산 초과 게이트)까지 활성만 세게 되는데, 서버의
// BUDGET_EXCEEDED 검증은 `is_active` 무관 9개 전체 합이라(01-endpoints.md:149) "화면은 통과인데
// 저장이 400" 이 난다. **표시만 거르고 계산 집합은 건드리지 않는다.**
import type { BenchmarkComparison } from "@/entities/payment";
import type { WeddingCategory } from "@/entities/wedding";
import { Card } from "@/shared/ui";
import { CategoryAllocationRow } from "./CategoryAllocationRow";

export interface CategoryAllocationListProps {
  /** 보기 모드면 원본, 시나리오 편집 중이면 draft — BudgetPage가 이미 이 둘을 합쳐서 내려준다.
      비활성 포함 9개 전체가 오고, 화면에서 거르는 것은 이 컴포넌트가 한다(머리말 참고). */
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
  const activeRows = rows.filter((category) => category.is_active);

  return (
    <Card title="카테고리별 예산 현황">
      <div>
        {activeRows.map((category) => {
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
