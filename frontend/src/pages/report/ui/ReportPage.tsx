// S5 리포트 — 시각 스펙: docs/mockups/s5-report.html
//
// **새 데이터가 없는 화면이다.** 숫자 13개가 전부 S2 대시보드와 같은 값이고(전수 대조), 다른 것은
// 보는 각도뿐이다 — 예산은 도넛 대신 3분할로, 카테고리는 예산 집행률 대신 체크리스트 진행률로,
// 납부는 2줄 대신 1줄로. 그래서 데이터를 `entities/wedding` 에 두고 두 화면이 함께 읽는다
// (`.oxlintrc.json` 이 pages → pages import 를 막는다).
//
// **목업과 의도적으로 다른 점** (전부 규범이 목업을 이기는 경우 — ADR 0006)
//   1. 카드 제목을 `<p>` 가 아니라 `<h2>` 로 낸다 — WCAG 1.3.1 F2 (a11y.md §4).
//   2. 「잔여」→「미배정」 — 세 값이 총액과 맞지 않아 보인다(BudgetStats 주석).
//   3. 추천 카드는 자주색 전면 채움이 아니다 — D2 종결(2026-08-22).
//   4. 추천 행이 2줄이다 — 260px 열에서 제목이 말줄임된다(RecoRow 주석).
//   5. 카테고리명은 데이터의 전체 이름을 쓴다 — 목업은 이 화면에서만 줄여 적었다.
//
// **아직 없는 것 — 지어내지 않았다**
//   · 로딩·빈·오류 상태: layout.md §9 에 6화면 전부 0건이다.
//   · 추천 항목의 기한: 목업 어디에도 「최소 보증 인원 조항 확인」의 날짜가 없다. 하나만 지어내면
//     정렬이 그 추측에 좌우되므로 배열 순서 자체를 계약으로 뒀다(entities 주석).
//   · 각 행에서 상세로 들어가는 진입: 목업에 어떤 어포던스도 없다(커서·호버·chevron 0건).
import { BUDGET, CATEGORY_BUDGETS, RECOMMENDED_CHECKS, UPCOMING_PAYMENTS } from "@/entities/wedding";
import { Card, Page } from "@/shared/ui";
import { BudgetStats } from "./BudgetStats";
import { CompactPaymentRow } from "./CompactPaymentRow";
import { completionPercent, CompletionRow } from "./CompletionRow";
import { RecoRow } from "./RecoRow";

// 행들을 감싸는 컨테이너. `first:`/`last:` 변이는 **형제 중 첫/마지막**을 보는데 `Card` 가 `<h2>`
// 제목을 먼저 렌더하므로, 감싸지 않으면 첫 행이 `:first-child` 가 되지 못해 위 패딩이 남는다.
const ROWS = "flex flex-col";

// **S5 는 정렬하고 S2 는 안 한다.** S2 의 「카테고리별 예산」은 배열 순서(= 준비 순서)를 그대로
// 보여 주지만, 리포트는 순위를 보여 주는 화면이라 진행률 내림차순이다. 목업 행 순서가 정확히 그것이고,
// `Array.prototype.sort` 는 ES2019 부터 **안정 정렬**이라 동점 2쌍(예물·예단/신혼여행 20% ·
// 혼수/청첩장 0%)의 상대 순서까지 목업과 같아진다.
// 정렬 기준은 화면이 표시하는 반올림값 그대로다 — CompletionRow 가 그 함수를 내보내는 이유다.
const BY_COMPLETION = CATEGORY_BUDGETS.toSorted((a, b) => completionPercent(b) - completionPercent(a));

// 추천 항목은 카테고리를 `id` 로 참조한다 — 이름을 복제하지 않는다. 해석은 화면 몫이고,
// 해석이 깨지는지는 테스트가 지킨다(id 가 그대로 화면에 나오면 실패한다).
const CATEGORY_NAME_BY_ID = new Map(CATEGORY_BUDGETS.map((category) => [category.id, category.name]));

export function ReportPage() {
  return (
    <Page title="리포트" subtitle="지금까지 준비 상황 요약이에요" width="max-w-none">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
        <Card title="예산">
          <BudgetStats summary={BUDGET} />
        </Card>

        <Card title="카테고리별 진행률">
          <div className={ROWS}>
            {BY_COMPLETION.map((category) => (
              <CompletionRow key={category.id} category={category} />
            ))}
          </div>
        </Card>

        <Card title="다음에 확인하면 좋아요" subtitle="기한이 가까운 순으로 5개만 골랐어요">
          <div className="flex flex-col gap-2.5">
            {RECOMMENDED_CHECKS.map((check) => (
              <RecoRow
                key={check.id}
                check={check}
                categoryName={CATEGORY_NAME_BY_ID.get(check.categoryId) ?? check.categoryId}
              />
            ))}
          </div>
        </Card>

        <Card title="다가오는 납부">
          <div className={ROWS}>
            {UPCOMING_PAYMENTS.map((payment) => (
              <CompactPaymentRow key={payment.id} payment={payment} />
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
}
