// 카테고리별 준비 진행률 한 줄 (시각 스펙: docs/mockups/s5-report.html:91-97).
//
// **S2 의 바와 뜻이 다르다.** S2 는 예산 지불률(`spent / budget`)이라 비용이 없는 카테고리에는
// 바를 그리지 않았다. 여기는 타임라인 준비 진행률(`timelineProgress`, 0~1 비율, 2026-08-28부터
// 체크리스트에서 전환)이라 **상견례도 바를 갖고, 0% 도 그린다** — 0 은 「예산이 없다」가 아니라
// 「하나도 안 했다」는 실제 값이다.
//
// 카테고리명은 데이터의 `name` 을 그대로 쓴다. 목업은 이 카드에서만 `청첩장·답례품` 을 `청첩장` 으로
// 줄여 적었는데(s5:97), 같은 화면의 추천 칩(s5:125)과 S2 는 전체 이름을 쓴다. 표시용 두 번째 이름을
// 만들면 값의 출처가 갈리므로 따르지 않았다. 실측 76.60px 로 `w-20`(80px) 안에 들어간다(여유 3.4px).
import type { ReportCategoryProgress } from "./adapt-report";
import { Progress } from "@/shared/ui";

/**
 * 표시와 정렬이 **같은 값**을 쓰게 하려고 내보낸다.
 * 정렬을 원비율로, 표시를 반올림값으로 따로 계산하면 25.4% 와 25.6% 처럼 같은 숫자로 보이는 두 행의
 * 순서가 화면과 어긋날 수 있다. 화면이 보여 주는 수가 곧 정렬 기준이어야 읽는 사람이 검산할 수 있다.
 */
export function completionPercent(category: ReportCategoryProgress): number {
  return Math.round(category.timelineProgress * 100);
}

export interface CompletionRowProps {
  category: ReportCategoryProgress;
}

export function CompletionRow({ category }: CompletionRowProps) {
  const percent = completionPercent(category);

  return (
    <div className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
      {/* [2026-08-29] `w-20` → `min-w-20`. 종전 값은 *"실측 76.60px 로 w-20(80px) 안에 들어간다
          (여유 3.4px)"* 라는 **한 폰트의 실측**에 기대고 있었다. iOS 는 Wanted Sans 가 도착하기
          전 폴백(Apple SD Gothic Neo)으로 먼저 레이아웃하고 메트릭이 다르다 — D18 이 이모지를
          걷어낸 것과 같은 종류의 문제다("OS 폰트로 폴백 → 플랫폼마다 폭이 달라진다").
          게다가 D19 로 `keep-all` 이 본문에 걸리면서 공백 없는 `청첩장·답례품`이 **한 덩어리
          어절**이 됐다(가운뎃점은 UAX #14 에서 낱말 안의 문자다) — 3.4px 여유로는 못 받는다.
          `min-w-20` 은 줄어들지 않되 필요하면 늘어나므로 정렬은 유지하고 상수 의존만 없앤다. */}
      <span className="min-w-20 shrink-0 text-sm font-bold text-ink">{category.name}</span>

      {/* Progress 는 루트에 w-full 이 하드코딩돼 있고 className prop 이 없다(Progress.tsx).
          래퍼로 폭을 준다 — 화면 하나 때문에 shared 의 API 를 넓히지 않는다. */}
      <div className="min-w-0 flex-1">
        {/* 접근명은 행마다 달라야 한다 — 바가 7개인 화면에서 같은 이름이면 구분되지 않는다.
            role="progressbar" 는 **접근명이 필수**다(WAI-ARIA 1.2 — name required).
            S2 의 「예산 지불률」과 뜻이 다르므로 이름도 다르게 짓는다. */}
        <Progress value={percent / 100} label={`${category.name} 준비 진행률`} />
      </div>

      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink-soft">{percent}%</span>
    </div>
  );
}
