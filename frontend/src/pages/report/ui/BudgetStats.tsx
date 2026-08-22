// 예산 3분할 (시각 스펙: docs/mockups/s5-report.html:80-87).
//
// **「잔여」가 아니라 「미배정」이다.** 목업은 45,000,000 / 3,800,000 / 1,000,000 을 놓고 셋째를
// 「잔여」라 적었는데, 45,000,000 − 3,800,000 은 1,000,000 이 아니라 41,200,000 이라 숫자가 맞지
// 않아 보인다. 빠진 값은 계획(미지급) 40,200,000 이다. S2 도넛은 그 항목을 범례에 넣어 문맥으로
// 뜻을 잡아 주지만 이 카드는 세 값만 나열하므로 혼자 서면 오독된다. 라벨을 고쳤다(S2 도 함께).
//
// ⚠️ **셀에 가로 패딩을 넣지 말 것.** `flex-1` 셀은 균등 분배되지 않고 각자 min-content 에서
// 멈춘다 — 열폭 260px(라우트 표의 auto-fit 최소)에서 가장 넓은 `45,000,000`(82.40px)만 바닥에
// 닿고 카드 패딩 안으로 1.92px 들어온다(브라우저 실측, 여유 14.08px). `px-1` 하나만 넣어도
// 3셀 × 8px = 24px 를 더 먹어 **카드 밖으로 나간다.**
//
// 구분선은 셀마다 오른쪽(`border-r … last:border-r-0`)이다. 목업은 `.stat + .stat{border-left}`
// 지만 결과는 같고, `divide-x` 도 같은 결과를 낸다(공식 문서: v4 는 `& > :not(:last-child)` 에
// `border-inline-end`). 새 클래스 계열을 들이지 않으려고 이미 검증된 세 개만 썼다.
import type { BudgetSummary } from "@/entities/wedding";
import { Money } from "@/shared/ui";

interface Stat {
  label: string;
  amount: (summary: BudgetSummary) => number;
}

const STATS: readonly Stat[] = [
  { label: "총 예산", amount: (s) => s.total },
  { label: "집행", amount: (s) => s.paid },
  { label: "미배정", amount: (s) => s.remaining },
];

export interface BudgetStatsProps {
  summary: BudgetSummary;
}

export function BudgetStats({ summary }: BudgetStatsProps) {
  return (
    <div className="flex">
      {STATS.map((stat) => (
        <div
          key={stat.label}
          className="flex flex-1 flex-col items-center gap-1 border-r border-line last:border-r-0"
        >
          {/* 라벨이 바로 아래에서 단위를 대신하므로 「원」을 끈다 — Money 의 unit prop 이 정의한 용법이다. */}
          <Money value={stat.amount(summary)} unit={null} className="text-sm" />
          <span className="text-xs text-ink-soft">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
