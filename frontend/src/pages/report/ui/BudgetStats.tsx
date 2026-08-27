// 예산 4분할 (시각 스펙: docs/mockups/s5-report.html:80-87 — 예전 3분할 레이아웃의 자리를
// 물려받았지만 계열 수가 늘어 배치 자체를 다시 짰다).
//
// **「잔여」가 아니라 「미배정」이다.** 목업은 45,000,000 / 3,800,000 / 1,000,000 을 놓고 셋째를
// 「잔여」라 적었는데, 45,000,000 − 3,800,000 은 1,000,000 이 아니라 41,200,000 이라 숫자가 맞지
// 않아 보인다. S2 도넛은 빠진 계열을 범례에 넣어 문맥으로 뜻을 잡아 주지만 이 카드는 값만
// 나열하므로 혼자 서면 오독된다. 라벨을 고쳤다(S2 도 함께).
//
// **4분류로 확장하며 가로 배치를 버렸다(2026-08-28, red-bug.md #7 근본 수정).** 예전 3분류는
// 컨테이너 쿼리로 가로 3칸 ↔ 세로 3행을 오갔지만(카드 내부폭 288px 경계), 그 계산조차 8자리
// 금액 세 칸(3 × 82.4px)이 데스크톱 3열 카드(내부 246.67px)에 안 들어가서 나온 타협이었다.
// 계열이 넷(+총예산까지 다섯 값)이면 가로 배치는 **어느 카드 폭에서도** 성립하지 않는다(5 ×
// 82.4 = 412px, 목업 전용인 폰 1열 카드 305px보다도 크다) — 컨테이너 쿼리로 임계를 다시 찾는
// 대신, 총예산을 헤더 행으로 분리하고 나머지 네 계열을 **항상 세로 목록**으로 고정했다.
// `CompletionRow.tsx`(같은 화면의 카테고리별 진행률 카드)와 같은 "라벨 왼쪽 · 값 오른쪽" 행
// 관례를 그대로 따른다 — 화면 안에서 다른 배치 언어를 만들지 않는다.
import type { BudgetSummary } from "@/entities/wedding";
import { Money } from "@/shared/ui";

interface Stat {
  label: string;
  amount: (summary: BudgetSummary) => number;
}

const CATEGORY_STATS: readonly Stat[] = [
  { label: "지불 완료", amount: (s) => s.paid },
  { label: "지불 예정", amount: (s) => s.scheduled },
  { label: "배정", amount: (s) => s.allocated },
  { label: "미배정", amount: (s) => s.unallocated },
];

const CATEGORY_ROW = "flex items-center justify-between gap-3 border-b border-line py-2 first:pt-0 last:border-b-0 last:pb-0";

export interface BudgetStatsProps {
  summary: BudgetSummary;
}

export function BudgetStats({ summary }: BudgetStatsProps) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <span className="text-sm font-bold text-ink">총 예산</span>
        <Money value={summary.total} className="text-base font-bold" />
      </div>
      <div className="flex flex-col">
        {CATEGORY_STATS.map((stat) => (
          <div key={stat.label} className={CATEGORY_ROW}>
            <span className="text-sm text-ink-soft">{stat.label}</span>
            <Money value={stat.amount(summary)} className="text-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
