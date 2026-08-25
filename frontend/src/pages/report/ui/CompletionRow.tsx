// 카테고리별 준비 진행률 한 줄 (시각 스펙: docs/mockups/s5-report.html:91-97).
//
// **S2 의 바와 뜻이 다르다.** S2 는 예산 집행률(`spent / budget`)이라 비용이 없는 카테고리에는
// 바를 그리지 않았다. 여기는 체크리스트 진행률(`checklistProgress`, 0~1 비율)이라
// **상견례도 바를 갖고, 0% 도 그린다** — 0 은 「예산이 없다」가 아니라 「하나도 안 했다」는 실제 값이다.
//
// 카테고리명은 데이터의 `name` 을 그대로 쓴다. 목업은 이 카드에서만 `청첩장·답례품` 을 `청첩장` 으로
// 줄여 적었는데(s5:97), 같은 화면의 추천 칩(s5:125)과 S2 는 전체 이름을 쓴다. 표시용 두 번째 이름을
// 만들면 값의 출처가 갈리므로 따르지 않았다. 실측 76.60px 로 `w-20`(80px) 안에 들어간다(여유 3.4px).
import type { CategoryBudget } from "@/entities/wedding";
import { Progress } from "@/shared/ui";

/**
 * 표시와 정렬이 **같은 값**을 쓰게 하려고 내보낸다.
 * 정렬을 원비율로, 표시를 반올림값으로 따로 계산하면 25.4% 와 25.6% 처럼 같은 숫자로 보이는 두 행의
 * 순서가 화면과 어긋날 수 있다. 화면이 보여 주는 수가 곧 정렬 기준이어야 읽는 사람이 검산할 수 있다.
 */
export function completionPercent(category: CategoryBudget): number {
  return Math.round(category.checklistProgress * 100);
}

export interface CompletionRowProps {
  category: CategoryBudget;
}

export function CompletionRow({ category }: CompletionRowProps) {
  const percent = completionPercent(category);

  return (
    <div className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
      <span className="w-20 shrink-0 text-sm font-bold text-ink">{category.name}</span>

      {/* Progress 는 루트에 w-full 이 하드코딩돼 있고 className prop 이 없다(Progress.tsx).
          래퍼로 폭을 준다 — 화면 하나 때문에 shared 의 API 를 넓히지 않는다. */}
      <div className="min-w-0 flex-1">
        {/* 접근명은 행마다 달라야 한다 — 바가 7개인 화면에서 같은 이름이면 구분되지 않는다.
            role="progressbar" 는 **접근명이 필수**다(WAI-ARIA 1.2 — name required).
            S2 의 「예산 집행률」과 뜻이 다르므로 이름도 다르게 짓는다. */}
        <Progress value={percent / 100} label={`${category.name} 준비 진행률`} />
      </div>

      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink-soft">{percent}%</span>
    </div>
  );
}
