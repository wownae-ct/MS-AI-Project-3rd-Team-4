// 8단계(분리됨): 카테고리별 예산 배분. 시각 스펙 s1-onboarding.html:348-378의 금액 입력 부분만 —
// 토글(무엇을 켤지)은 7단계(Step7CategoryToggle.tsx)로 분리했다. 분리 근거는 그 파일 머리말 참조.
//
// 이 스텝은 7단계가 남긴 **활성 카테고리만** 보여준다(12_final_prototype_mockup.html의 onbStep8
// 이 `CATEGORY_META.filter(active)`로 하는 것과 동일) — 꺼둔 카테고리는 배분할 금액 자체가
// 의미 없으므로 여기 나타나지 않는다.
//
// **막대(slider)는 숫자 입력을 대체하지 않고 같이 쓴다(2026-08-26 사용자 지시).** 숫자 입력은
// 정확한 금액을 바로 타이핑하고 싶을 때, 막대는 감으로 빠르게 조절하고 싶을 때 — 서로 다른
// 입력 습관을 둘 다 지원한다. 둘 다 같은 `plannedBudget` 상태를 공유하므로 어느 쪽으로 바꿔도
// 즉시 반영된다. 막대 조절 단위는 10만원(2026-08-26 사용자 지시) — 클수록 조작이 거칠어지지만,
// 예식 예산 규모(수백~수천만원)에서 만원 단위 세밀 조정은 막대로는 오히려 부정확하다.
import type { AllocationRow } from "./Step7CategoryToggle";
import { AMOUNT_STEP_MANWON, manwonToWon, wonToManwon } from "@/shared/lib/money";
import { NumberInput } from "@/shared/ui";

const ROW = "flex flex-col gap-2 border-b border-line py-3 last:border-b-0 last:pb-0 first:pt-0";
const TOP_ROW = "flex items-center gap-2.5";
const AMOUNT_INPUT =
  "min-h-tap w-28 rounded-md border border-line bg-surface px-2.5 text-right text-base text-ink " +
  "[font-variant-numeric:tabular-nums] focus-visible:border-primary";
const SLIDER = "h-1.5 w-full cursor-pointer accent-primary";

const BUDGET_STEP_WON = 100_000; // 10만원 단위
// 만원 단위 스텝은 shared 로 올라갔다 — 예산 페이지의 슬라이더(CategoryAllocationRow)와
// 총예산 인라인 수정(BudgetDonut)이 같은 값을 써야 하는데, 여기 사문 상수로 두면 갈린다.

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
        {activeRows.map((row) => {
          // 슬라이더 상한 — 총예산보다 이미 더 배분돼 있으면(초과 상태) 그 값까지는 보여줘야
          // 막대가 현재 값을 못 담고 잘리지 않는다.
          const sliderMax = Math.max(totalBudgetEstimate, row.plannedBudget, BUDGET_STEP_WON);
          return (
            <div key={row.categoryCode} className={ROW}>
              <div className={TOP_ROW}>
                <span className="flex-1 text-sm font-bold text-ink">{row.nameKo}</span>
                {row.hasCost ? (
                  <div className="flex flex-none items-center gap-1.5">
                    <NumberInput
                      className={AMOUNT_INPUT}
                      min={0}
                      step={AMOUNT_STEP_MANWON}
                      aria-label={`${row.nameKo} 예산 금액`}
                      // 행 배열 자체는 원 단위를 유지한다(합계·진행률 계산이 이미 원 단위로 짜여
                      // 있다) — 만원 변환은 이 입력의 표시/입력 경계에서만 일어난다.
                      value={wonToManwon(row.plannedBudget)}
                      // 이 행은 슬라이더와 값을 공유해 "빈 칸"을 담을 수 없다 — null 은 0으로
                      // 접는다. 지운 직후의 빈 칸 표시는 NumberInput 이 스스로 지킨다(그쪽 주석).
                      onValueChange={(next) => {
                        updateRow(row.categoryCode, manwonToWon(next ?? 0));
                      }}
                    />
                    <span className="text-xs font-bold text-ink-soft">만원</span>
                  </div>
                ) : (
                  <span className="flex-none text-xs text-ink-soft">비용 없음</span>
                )}
              </div>
              {row.hasCost && (
                <input
                  type="range"
                  className={SLIDER}
                  min={0}
                  max={sliderMax}
                  step={BUDGET_STEP_WON}
                  value={row.plannedBudget}
                  aria-label={`${row.nameKo} 예산 조절`}
                  onChange={(event) => updateRow(row.categoryCode, Number(event.target.value))}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
