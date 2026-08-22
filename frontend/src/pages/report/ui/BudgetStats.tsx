// 예산 3분할 (시각 스펙: docs/mockups/s5-report.html:80-87).
//
// **「잔여」가 아니라 「미배정」이다.** 목업은 45,000,000 / 3,800,000 / 1,000,000 을 놓고 셋째를
// 「잔여」라 적었는데, 45,000,000 − 3,800,000 은 1,000,000 이 아니라 41,200,000 이라 숫자가 맞지
// 않아 보인다. 빠진 값은 계획(미지급) 40,200,000 이다. S2 도넛은 그 항목을 범례에 넣어 문맥으로
// 뜻을 잡아 주지만 이 카드는 세 값만 나열하므로 혼자 서면 오독된다. 라벨을 고쳤다(S2 도 함께).
//
// ## 폭에 따라 배치가 바뀐다 — 미디어 쿼리가 아니라 **컨테이너 쿼리**다
//
// 목업은 390pt 폰 1열(카드 약 358px) 전용이라 3칸이 넉넉하지만, 이 화면의 라우트 계약은
// `repeat(auto-fit, minmax(260px, 1fr))` 이고 **데스크톱 3열에서 카드는 280px** 이다. 그 폭에서
// 가장 긴 `45,000,000`(@text-sm 700 = 82.4px) 세 칸은 3 × 82.4 = 247.2px 인데 카드 내부폭은
// 246.67px — **물리적으로 들어가지 않는다.** 브라우저 실측으로 숫자가 구분선에 1px 거리로 붙었다.
//
// 셀 패딩을 깎거나 글자를 줄여서 해결하지 않는다 — 타입 스케일 하한(12px)과 규범(금액은 굵은 ink)
// 을 건드리는 길이다. 대신 **카드 내부폭이 18rem(288px) 미만이면 세로로 쌓는다** (`@max-2xs:` —
// Tailwind v4 컨테이너 변이, 공식 문서의 `@2xs` = 18rem). 라벨이 왼쪽 · 금액이 오른쪽인 행 3개가 된다.
// `Card` 가 `@container`(container-type: inline-size) 를 선언해 둔 것이 정확히 이 용도다 —
// 같은 카드가 데스크톱 3열에 놓이든 폰 1열에 놓이든 **자기 폭만 보고** 배치를 정한다.
//
// ⚠️ **컨테이너 쿼리는 카드의 content-box 를 잰다** — outer 에서 패딩 32 + 보더 2 를 뺀 값이다(브라우저 실측:
// 카드 339px 에서 `@max-xs`(20rem) 가 켜졌다 — 내부 305 < 320). 임계를 outer 가 아니라 내부폭으로 읽어야 한다:
//   데스크톱 3열 카드 280 → 내부 246.67 → 쌓는다 (3 × 82.4 가 안 들어가는 바로 그 폭)
//   폰 1열 카드 339 → 내부 305 → 가로 3칸 (목업 그대로 · 셀당 여유 9~15px)
//   경계 288 직전 → 셀 96 · 숫자 82.4 → 여유 6.8px (목업 최소치와 같은 급)
// 처음 `@max-xs` 로 넣었다가 폰에서도 쌓여 목업과 달라진 것을 실측으로 잡고 한 단계 내렸다.
//
// ⚠️ 가로 배치 셀에 가로 패딩을 넣지 말 것. `flex-1` 셀은 균등 분배되지 않고 각자 min-content 에서
// 멈춘다 — 가로 배치가 켜지는 최소 내부폭 288px 에서 여유는 셀당 6.8px 뿐이다(실측).
//
// 구분선은 가로일 때 셀 오른쪽(`border-r … last:border-r-0`), 세로일 때 행 아래(`border-b … last:border-b-0`).
// `divide-*` 도 같은 결과를 내지만(공식 문서: v4 는 `& > :not(:last-child)`) 새 클래스 계열을 들이지 않는다.
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

// 가로(기본) ↔ 세로(@max-2xs) 를 한 문자열에 둔다. 조각을 이어 붙이지 않는다(CLAUDE.md §5.1).
const ROW = "flex @max-2xs:flex-col";
const CELL =
  "flex flex-1 flex-col items-center gap-1 border-r border-line last:border-r-0 " +
  "@max-2xs:flex-row-reverse @max-2xs:items-baseline @max-2xs:justify-between @max-2xs:gap-3 " +
  "@max-2xs:border-r-0 @max-2xs:border-b @max-2xs:py-2 @max-2xs:first:pt-0 @max-2xs:last:border-b-0 @max-2xs:last:pb-0";

export interface BudgetStatsProps {
  summary: BudgetSummary;
}

export function BudgetStats({ summary }: BudgetStatsProps) {
  return (
    <div className={ROW}>
      {STATS.map((stat) => (
        <div key={stat.label} className={CELL}>
          {/* 라벨이 바로 옆에서 단위를 대신하므로 「원」을 끈다 — Money 의 unit prop 이 정의한 용법이다. */}
          <Money value={stat.amount(summary)} unit={null} className="text-sm" />
          <span className="text-xs text-ink-soft">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
