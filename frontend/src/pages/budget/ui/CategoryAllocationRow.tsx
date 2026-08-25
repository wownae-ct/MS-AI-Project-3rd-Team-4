// BudgetPage.tsx에서 분리 — eslint/max-lines(300줄) 게이트 때문에 카테고리 한 행의 세 가지
// 렌더 분기(비용 없음/보기 모드/시나리오 편집 모드 슬라이더)를 별도 파일로 뺐다. 상태(scenarioDraft
// 등)는 여전히 BudgetPage가 소유한다 — 이 컴포넌트는 순수하게 한 행만 그린다.
import { Slider } from "@base-ui/react/slider";
import type { WeddingCategory } from "@/entities/wedding";
import { manwonToWon, wonToManwon } from "@/shared/lib/money";
import { Progress } from "@/shared/ui";

export interface CategoryAllocationRowProps {
  category: WeddingCategory;
  hasCost: boolean;
  totalBudget: number;
  /** 편집 중이 아니면(보기 모드) 슬라이더 대신 읽기전용 진행률 바를 그린다. */
  isEditingScenario: boolean;
  /** 저장된 원본 금액 — 초안(draft)과 비교해 취소선/델타를 그리는 기준. */
  originalAmount: number;
  onDraftChange: (categoryCode: string, plannedBudget: number) => void;
}

const ROW = "flex flex-col gap-1.5 border-b border-line py-3 last:border-b-0 last:pb-0 first:pt-0";
// 10만원 단위(2026-08-26 사용자 지시) — 단위가 "만원"이라 여기선 10. 온보딩 Step8Allocation의
// 같은 지시(BUDGET_STEP_WON = 100_000원)와 값 자체는 동일하다, 단위만 다르다.
const SLIDER_STEP_MANWON = 10;

export function CategoryAllocationRow({
  category,
  hasCost,
  totalBudget,
  isEditingScenario,
  originalAmount,
  onDraftChange,
}: CategoryAllocationRowProps) {
  if (!hasCost) {
    return (
      <div className={ROW}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-ink">{category.name_ko}</span>
          <span className="text-xs text-ink-soft">비용 없음</span>
        </div>
      </div>
    );
  }

  if (!isEditingScenario) {
    return (
      <div className={ROW}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-ink">{category.name_ko}</span>
          <span className="text-sm font-bold text-ink [font-variant-numeric:tabular-nums]">
            {wonToManwon(category.planned_budget)}만원
          </span>
        </div>
        <Progress
          value={category.planned_budget > 0 ? category.paid_amount / category.planned_budget : 0}
          label={`${category.name_ko} 예산 집행률`}
        />
      </div>
    );
  }

  const delta = category.planned_budget - originalAmount;
  const changed = delta !== 0;
  // 트랙 전체(0~max)를 기준으로 한 잠김 구간 폭 — maxManwon 은 항상 현재 배분액 이상이어야
  // 슬라이더가 값을 못 담는 사고가 안 난다(총예산보다 이미 더 배정된 극단적 케이스 방어).
  const maxManwon = Math.max(wonToManwon(totalBudget), wonToManwon(category.planned_budget), 1);
  const lockedPercent = totalBudget > 0 ? (category.paid_amount / manwonToWon(maxManwon)) * 100 : 0;

  return (
    <div className={ROW}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-ink">{category.name_ko}</span>
        <span className="flex-none text-sm font-bold text-ink [font-variant-numeric:tabular-nums]">
          {changed && <span className="mr-1 font-normal text-ink-soft line-through">{wonToManwon(originalAmount)}만원</span>}
          {wonToManwon(category.planned_budget)}만원
        </span>
      </div>

      <Slider.Root
        value={wonToManwon(category.planned_budget)}
        min={0}
        max={maxManwon}
        step={SLIDER_STEP_MANWON}
        disabled={!category.is_active}
        onValueChange={(manwonValue) => {
          // 이미 지급한 금액 아래로는 못 내린다 — paid_amount 가 슬라이더 하한이다.
          const next = Math.max(category.paid_amount, manwonToWon(manwonValue));
          onDraftChange(category.category_code, next);
        }}
      >
        <Slider.Control className="relative flex h-4 w-full items-center">
          <Slider.Track className="relative h-2 w-full rounded-pill bg-line">
            {/* overflow-hidden은 이 안쪽 래퍼에만 건다 — Track 자체에 걸면 15px Thumb(트랙 높이
                8px보다 큼)이 위아래로 잘린다. */}
            <div className="absolute inset-0 overflow-hidden rounded-pill">
              <Slider.Indicator className="h-full bg-primary" />
              {/* 잠김 구간 — Base UI가 모르는 개념이라 별도 오버레이로 그린다. */}
              {lockedPercent > 0 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 left-0 h-full bg-ink-soft"
                  style={{ width: `${lockedPercent.toString()}%` }}
                />
              )}
            </div>
            {/* 목업의 thumb 바깥 primary 링(box-shadow)은 넣지 않는다 — 이 저장소는 그림자·링을
                금지한다(D9/D10, shared/ui/README.md). */}
            <Slider.Thumb className="h-[15px] w-[15px] rounded-pill border-[2.5px] border-surface bg-primary" />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>

      <div className="flex items-baseline justify-between gap-2 text-xs text-ink-soft">
        <span>지급 {wonToManwon(category.paid_amount)}만원 잠김</span>
        {changed && (
          <span className="font-bold text-primary">
            {delta > 0 ? "+" : ""}
            {wonToManwon(delta)}만원
          </span>
        )}
      </div>
    </div>
  );
}
