// S5 리포트 — 시각 스펙: docs/mockups/s5-report.html
//
// **예산은 S6 예산 탭과 같은 함수로 계산한다(2026-08-28, red-bug.md #7 근본 수정).** 예전엔
// `report.budget_summary`(paid/remaining 3값)를 역산해 썼는데, 그 정의가 S6
// (`deriveBudgetSummary`, 배정액 기준)와 달라서 같은 웨딩의 "미배정"이 두 화면에서 다르게
// 보였다. 이제 이 화면도 `deriveBudgetSummary(weddingCategories, ...)`를 직접 호출한다 —
// `report.budget_summary`는 `total_budget` 값 하나만 쓴다(어차피 카테고리 목록을 이미
// 병렬로 불러오고 있으므로 새 API 호출은 없다).
//
// **카테고리별 진행률은 더 이상 S2 와 같은 값이 아니다(2026-08-28부터).** 이전엔 `GET
// /reports/me`/`GET /dashboard/summary` 둘 다 체크리스트 진행률을 같은 값으로 줬지만, 이 화면의
// `category_completion[].progress_rate`는 이제 타임라인 진행률로 산출 기준이 바뀌었다(백엔드
// `get_timeline_progress_by_category()`) — `GET /dashboard/summary`의 `categories[].progress_rate`
// (S2, 체크리스트 기준)는 이 변경과 무관하게 그대로다. "같은 값의 다른 뷰"였던 원래 설계는 이
// 카드에 한해 더 이상 사실이 아니다 — `CompletionRow.tsx`/`adapt-report.ts`의 `timelineProgress`
// 참고.
//
// **"다가오는 납부" 카드 제거(2026-08-27, 사용자 지시).** 홈 탭(S2)에 이미 같은 성격의 카드
// (`UpcomingPaymentsCard`, `getUpcomingPayments()` 기반)가 있어 중복이었다 — 이 화면이 쓰던
// "D-day · 제목" 한 줄 형태가 그쪽으로 옮겨갔다(그 컴포넌트도 같이 쓰는 예산 탭 S6에도 반영).
// `CompactPaymentRow.tsx`/`adaptUpcomingPayments()`/`entities/wedding`의 `UpcomingPayment`
// 타입은 이 카드 전용이라 함께 삭제했다.
//
// **목업과 의도적으로 다른 점** (전부 규범이 목업을 이기는 경우 — ADR 0006)
//   1. 카드 제목을 `<p>` 가 아니라 `<h2>` 로 낸다 — WCAG 1.3.1 F2 (a11y.md §4).
//   2. 「잔여」→「미배정」 — 네 값이 총액과 맞지 않아 보인다(BudgetStats 주석).
//   3. 추천 카드는 자주색 전면 채움이 아니다 — D2 종결(2026-08-22).
//   4. 추천 행이 2줄이다 — 260px 열에서 제목이 말줄임된다(RecoRow 주석).
//   5. 카테고리명은 데이터의 전체 이름을 쓴다 — 목업은 이 화면에서만 줄여 적었다.
//
// **실API 연동 이후 새로 생긴 것들**
//   · 로딩/에러 상태: §5 대시보드가 이미 세운 관례 그대로 — 로딩은 자리표시 + 문구(D14),
//     에러는 `role="alert"`.
//   · `GET /wedding-categories`를 `GET /reports/me`와 함께 불러온다 — 카테고리 진행률 응답에
//     이름이 없어서다(adapt-report.ts 참고). 두 호출이 병렬(Promise.all)이라 어느 한쪽이
//     실패하면 화면 전체를 에러로 취급한다(부분 렌더는 이 화면 어디에도 선례가 없다).
//   · 추천 카드의 우선순위 배지: RecoRow.tsx 머리말 — source(출처 티어) 대신 priority(높음/보통/
//     낮음)를 쓴다, API가 실제로 그 필드를 준다.
import { useEffect, useState } from "react";
import { getMyReport, type MyReport } from "@/entities/dashboard";
import { deriveBudgetSummary, getWeddingCategories, type WeddingCategory } from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { Card, Loading, Page, SkeletonRows } from "@/shared/ui";
import { adaptCategoryCompletions } from "./adapt-report";
import { BudgetStats } from "./BudgetStats";
import { completionPercent, CompletionRow } from "./CompletionRow";
import { RecoRow } from "./RecoRow";

// 행들을 감싸는 컨테이너. `first:`/`last:` 변이는 **형제 중 첫/마지막**을 보는데 `Card` 가 `<h2>`
// 제목을 먼저 렌더하므로, 감싸지 않으면 첫 행이 `:first-child` 가 되지 못해 위 패딩이 남는다.
const ROWS = "flex flex-col";

interface ReportData {
  report: MyReport;
  weddingCategories: WeddingCategory[];
}

export function ReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyReport(), getWeddingCategories()])
      .then(([report, categoriesResponse]) => {
        if (!cancelled) setData({ report, weddingCategories: categoriesResponse.categories });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "리포트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error !== null) {
    return (
      <Page title="리포트" subtitle="지금까지 준비 상황 요약이에요" width="max-w-none">
        <p role="alert" className="rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
          {error}
        </p>
      </Page>
    );
  }

  if (data === null) {
    return (
      <Page title="리포트" subtitle="지금까지 준비 상황 요약이에요" width="max-w-none">
        {/* D14 L2 */}
        <Card>
          <SkeletonRows count={4} />
        </Card>
        <Loading />
      </Page>
    );
  }

  const { report, weddingCategories } = data;
  const budget = deriveBudgetSummary(weddingCategories, report.budget_summary.total_budget);
  const categoryCompletions = adaptCategoryCompletions(report.category_completion, weddingCategories);

  // **S5 는 정렬하고 S2 는 안 한다.** S2 의 「카테고리별 예산」은 배열 순서(= 준비 순서)를 그대로
  // 보여 주지만, 리포트는 순위를 보여 주는 화면이라 진행률 내림차순이다. `Array.prototype.toSorted`
  // 는 안정 정렬이라 동점 카테고리의 상대 순서는 원래 응답 순서(= display_order)를 유지한다.
  const byCompletion = categoryCompletions.toSorted((a, b) => completionPercent(b) - completionPercent(a));

  const categoryNameById = new Map(categoryCompletions.map((category) => [category.id, category.name]));

  return (
    <Page title="리포트" subtitle="지금까지 준비 상황 요약이에요" width="max-w-none">
      {/* 하한을 `min(…,100%)` 으로 감싼다 — `auto-fit` 은 열 개수만 줄이고 트랙 하한은 고정이라,
          하한이 컨테이너보다 커지는 순간 1열로 접힌 뒤에도 그대로 넘친다. 260px 은 320px 기기의
          컨테이너 폭(288px) 안이라 **지금은** 안전하지만, 값이 한 번만 올라가도 대시보드가 실제로
          당한 결함(그 파일의 🚨 주석)이 여기서 재현된다. 두 화면이 같은 형태를 쓰므로 방어도 같이 둔다. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-5">
        <Card title="예산">
          <BudgetStats summary={budget} />
        </Card>

        <Card title="타임라인 진행률">
          {byCompletion.length === 0 ? (
            <p className="text-sm text-ink-soft">진행률을 계산할 카테고리가 아직 없습니다.</p>
          ) : (
            <div className={ROWS}>
              {byCompletion.map((category) => (
                <CompletionRow key={category.id} category={category} />
              ))}
            </div>
          )}
        </Card>

        <Card title="다음에 확인하면 좋아요" subtitle="우선순위가 높은 순으로 최대 5개예요">
          {report.next_recommended_checks.length === 0 ? (
            <p className="text-sm text-ink-soft">추천할 항목이 아직 없습니다.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {report.next_recommended_checks.map((check) => (
                <RecoRow
                  key={check.checklist_item_id}
                  title={check.title}
                  priority={check.priority}
                  categoryName={categoryNameById.get(check.category_code) ?? check.category_code}
                  categoryCode={check.category_code}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}
