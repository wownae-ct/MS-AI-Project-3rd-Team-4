// 카테고리별 예산 한 줄 (시각 스펙: docs/mockups/s2-dashboard.html:219-284).
//
// **`budget === null` 은 0 과 다르다.** 목업의 `.no-cost` 행(s2:219-224 「상견례」)은 금액도 바도 없다.
// 0 으로 두고 0% 바를 그리면 *"예산이 있는데 하나도 안 썼다"* 로 읽힌다 — `Progress` 가 불확정을
// 0% 로 그리지 않기로 한 것(D11)과 같은 종류의 구분이다.
//
// **금액 위계는 크기로 준다.** 목업은 총액을 `ink-soft` + 보통 굵기로 흐리지만(s2:131-132),
// 규범은 *"금액은 항상 tabular-nums + 700"*(docs/design/README.md) 이고 ADR 0006 상 규범이 목업을
// 이긴다. 그래서 둘 다 굵은 `ink` 로 두고 **집행액만 한 단계 크게** 해 위계를 만든다 —
// 규범이 제약하지 않는 축(크기)을 쓴 것이다.
import type { CategoryBudget } from "@/entities/wedding";
import { Badge, Money, Progress } from "@/shared/ui";

export interface CategoryRowProps {
  category: CategoryBudget;
}

// 조건부 클래스는 **완성된 리터럴 두 개 중 하나를 고른다.** 조각을 이어 붙이면 Tailwind 스캐너가
// 찾지 못해 유틸리티가 생성되지 않는다(CLAUDE.md §5.1).
const TOP_ROW = "flex items-center justify-between gap-2";
const TOP_ROW_WITH_BAR = "mb-1.5 flex items-center justify-between gap-2";

export function CategoryRow({ category }: CategoryRowProps) {
  const { name, focus, budget, spent, checklistDone, checklistTotal } = category;

  return (
    <div className="border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className={budget === null ? TOP_ROW : TOP_ROW_WITH_BAR}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-sm font-bold whitespace-nowrap text-ink">{name}</span>
          {focus && <Badge>FOCUS</Badge>}
        </div>

        {budget !== null && (
          <span className="text-xs whitespace-nowrap text-ink-soft">
            <Money value={spent} unit={null} className="text-sm" /> / <Money value={budget} className="text-xs" />
          </span>
        )}
      </div>

      {budget !== null && (
        <div className="mb-1.5">
          {/* 접근명은 카테고리마다 달라야 한다 — 같은 이름의 진행률이 6개면 구분이 되지 않는다. */}
          <Progress value={budget > 0 ? spent / budget : 0} label={`${name} 예산 집행률`} />
        </div>
      )}

      <p className="text-xs text-ink-soft">
        체크리스트 {checklistDone}/{checklistTotal}
      </p>
    </div>
  );
}
