// 8단계(분리됨): 카테고리별 예산 배분. 시각 스펙 s1-onboarding.html:348-378의 금액 입력 부분만 —
// 토글(무엇을 켤지)은 7단계(Step7CategoryToggle.tsx)로 분리했다. 분리 근거는 그 파일 머리말 참조.
//
// 이 스텝은 7단계가 남긴 **활성 카테고리만** 보여준다(12_final_prototype_mockup.html의 onbStep8
// 이 `CATEGORY_META.filter(active)`로 하는 것과 동일) — 꺼둔 카테고리는 배분할 금액 자체가
// 의미 없으므로 여기 나타나지 않는다.
import type { AllocationRow } from "./Step7CategoryToggle";
import { manwonToWon, wonToManwon } from "@/shared/lib/money";

const ROW = "flex items-center gap-2.5 border-b border-line py-3 last:border-b-0 last:pb-0 first:pt-0";
const AMOUNT_INPUT =
  "w-28 rounded-md border border-line bg-surface px-2.5 py-1.5 text-right text-sm text-ink " +
  "[font-variant-numeric:tabular-nums] focus-visible:border-primary";

export interface Step8Props {
  rows: AllocationRow[];
  onRowsChange: (rows: AllocationRow[]) => void;
  totalBudgetEstimate: number;
}

export function Step8Allocation({ rows, onRowsChange, totalBudgetEstimate }: Step8Props) {
  const activeRows = rows.filter((row) => row.isActive);
  const allocated = activeRows.reduce((sum, row) => sum + row.plannedBudget, 0);
  const remaining = totalBudgetEstimate - allocated;
  const percent = totalBudgetEstimate > 0 ? Math.min(1, Math.max(0, allocated / totalBudgetEstimate)) : 0;

  function updateRow(categoryCode: string, plannedBudget: number) {
    onRowsChange(rows.map((row) => (row.categoryCode === categoryCode ? { ...row, plannedBudget } : row)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-line bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-base font-bold text-ink [font-variant-numeric:tabular-nums]">
            {allocated.toLocaleString("ko-KR")}원 배분됨
          </span>
          <span className="text-xs text-ink-soft">/ {totalBudgetEstimate.toLocaleString("ko-KR")}원</span>
        </div>
        <div className="mb-1.5 h-1.5 overflow-hidden rounded-pill bg-line">
          <div className="h-full rounded-pill bg-primary" style={{ width: `${(percent * 100).toString()}%` }} />
        </div>
        <p className="text-xs text-ink-soft">
          {remaining >= 0 ? `${remaining.toLocaleString("ko-KR")}원 남음` : `${Math.abs(remaining).toLocaleString("ko-KR")}원 초과`}
        </p>
      </div>

      <div>
        {activeRows.map((row) => (
          <div key={row.categoryCode} className={ROW}>
            <span className="flex-1 text-sm font-bold text-ink">{row.nameKo}</span>
            {row.hasCost ? (
              <div className="flex flex-none items-center gap-1.5">
                <input
                  className={AMOUNT_INPUT}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  // 행 배열 자체는 원 단위를 유지한다(합계·진행률 계산이 이미 원 단위로 짜여 있다) —
                  // 만원 변환은 이 입력의 표시/입력 경계에서만 일어난다.
                  value={wonToManwon(row.plannedBudget)}
                  onChange={(event) => updateRow(row.categoryCode, manwonToWon(Number(event.target.value)))}
                />
                <span className="text-xs font-bold text-ink-soft">만원</span>
              </div>
            ) : (
              <span className="flex-none text-xs text-ink-soft">비용 없음</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
