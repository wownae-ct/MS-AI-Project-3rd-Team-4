// S2 대시보드 — 시각 스펙: docs/mockups/s2-dashboard.html
//
// 콘텐츠 열은 `repeat(auto-fit, minmax(320px, 1fr))` 다(layout.md §2 라우트 표). `auto-fit` 을 쓰는
// 이유는 브레이크포인트를 늘리지 않고 카드가 스스로 재배치되게 하기 위해서다(§7) — 그래서 `Page` 에
// `max-w-none` 을 주어 폭 제한은 셸(최대 1160px)에 맡긴다.
//
// **목업과 의도적으로 다른 점 3가지** (전부 규범이 목업을 이기는 경우 — ADR 0006)
//   1. 브랜드 블록(s2:146-149)을 그리지 않는다 — 사이드바 소관이다(layout.md §4).
//      화면이 함께 그리면 데스크톱에서 두 번 나온다.
//   2. 카드 제목을 `<p>` 가 아니라 `<h2>` 로 낸다 — WCAG 1.3.1 F2 (a11y.md §4).
//   3. 금액은 총액까지 굵은 `ink` 다 — "금액은 항상 tabular-nums + 700"(docs/design/README.md).
//
// **아직 없는 것 — 지어내지 않았다**
//   · 로딩·빈·오류 상태: layout.md §9 에 6화면 전부 0건이다. 지금은 합성 데이터가 항상 존재한다.
//   · 카테고리 → S3 상세 진입: layout.md §1 은 "카테고리 상세는 홈에서 진입하는 하위 화면"이라 하지만
//     목업에 어떤 진입 어포던스도 없다(커서·호버·chevron 0건). S3 착수 때 함께 정한다.
//   · 데스크톱 상단바(제목·D-Day·주요 액션, layout.md §4): 미구현이라 D-Day 히어로를 모든 폭에서 낸다.
import { BUDGET, CATEGORY_BUDGETS, UPCOMING_PAYMENTS, WEDDING } from "@/entities/wedding";
import { Card, Page } from "@/shared/ui";
import { BudgetDonut } from "./BudgetDonut";
import { CategoryRow } from "./CategoryRow";
import { PaymentRow } from "./PaymentRow";

// 행들을 감싸는 컨테이너. `first:`/`last:` 변이는 **형제 중 첫/마지막**을 보는데 `Card` 가 `<h2>`
// 제목을 먼저 렌더하므로, 감싸지 않으면 첫 행이 `:first-child` 가 되지 못해 위 패딩이 남는다.
const ROWS = "flex flex-col";

export function DashboardPage() {
  return (
    <Page title="대시보드" width="max-w-none">
      <div className="flex flex-col gap-0.5">
        <p className="text-4xl font-bold tracking-tight text-ink tabular-nums">D-{WEDDING.dDay}</p>
        <p className="text-sm text-ink-soft">{WEDDING.dateLabel} 결혼식</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-5">
        <Card title="예산 현황">
          <BudgetDonut summary={BUDGET} />
        </Card>

        <Card title="다가오는 납부">
          <div className={ROWS}>
            {UPCOMING_PAYMENTS.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} />
            ))}
          </div>
        </Card>

        <Card title="카테고리별 예산">
          <div className={ROWS}>
            {CATEGORY_BUDGETS.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
}
