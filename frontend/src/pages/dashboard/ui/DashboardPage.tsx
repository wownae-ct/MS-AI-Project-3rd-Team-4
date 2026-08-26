// S2 대시보드 — 시각 스펙: docs/mockups/s2-dashboard.html
//
// 콘텐츠 열은 `repeat(auto-fit, minmax(320px, 1fr))` 다(layout.md §2 라우트 표). `auto-fit` 을 쓰는
// 이유는 브레이크포인트를 늘리지 않고 카드가 스스로 재배치되게 하기 위해서다(§7) — 그래서 `Page` 에
// `max-w-none` 을 주어 폭 제한은 셸(최대 1160px)에 맡긴다.
//
// **목업과 의도적으로 다른 점** (전부 규범/요구사항이 목업을 이기는 경우 — ADR 0006)
//   1. 브랜드 블록(s2:146-149)을 그리지 않는다 — 사이드바 소관이다(layout.md §4).
//      화면이 함께 그리면 데스크톱에서 두 번 나온다.
//   2. 카드 제목을 `<p>` 가 아니라 `<h2>` 로 낸다 — WCAG 1.3.1 F2 (a11y.md §4).
//   3. 금액은 총액까지 굵은 `ink` 다 — "금액은 항상 tabular-nums + 700"(docs/design/README.md).
//   4. **예산 도넛을 걷어냈다(UX 개편, 2026-08-26)** — 예산 상세는 예산 페이지가 전담하고,
//      대시보드는 카테고리별 진행 상황(체크리스트·시세비교)에 집중한다. 도넛 자체는
//      `pages/budget/ui/BudgetDonut.tsx`로 이동했다(`git mv`, 이력 보존).
//   5. **"카테고리별 예산"을 "카테고리별 체크리스트 · 시세비교"로 바꿨다** — `CategoryRow.tsx`
//      머리말 참고.
//
// **실API 연동 이후 생긴 것들**
//   · 로딩/에러 상태: 실 fetch 는 실패할 수 있어 최소 텍스트만 추가했다("불러오는 중…",
//     `role="alert"` — 로그인/온보딩 화면이 이미 쓰는 관례 그대로).
//   · "다가오는 납부" → "다가오는 할 일": `PaymentRow.tsx` 머리말 참고 — API 응답에 금액이 없다.
//   · 카테고리 → S3 상세 진입: `CategoryRow.tsx`가 행 전체를 `/category/$id` 링크로 감싼다.
//
// **UX 개편 2차(2026-08-26, 사용자 지시)**
//   6. 결혼식 날짜 수정 버튼을 예산탭(S6)에서 이 헤드라인 옆으로 옮겼다 — `WeddingHeadline.tsx`
//      머리말 참고. 예산탭엔 더 이상 날짜 수정 UI가 없다.
//   7. "다가오는 할 일" 카드 옆에 실제 결제 예정(금액 포함) 카드 "다가오는 납부"를 새로 추가했다
//      — `UpcomingPaymentsSection.tsx`. 5번에서 이름을 뺏긴 그 "다가오는 납부"가 별개 카드로
//      돌아온 것이다(같은 이름을 다른 두 의미로 다시 쓰지 않게, 원본 데이터는 여전히 다르다 —
//      하나는 결제 예정, 하나는 체크리스트/타임라인 혼합 피드).
import { useCallback, useEffect, useMemo, useState } from "react";
import { getDashboardSummary, type DashboardCategorySummary, type DashboardSummary } from "@/entities/dashboard";
import { ApiError } from "@/shared/api";
import { Card, Page } from "@/shared/ui";
import { adaptCategories, adaptHeadline } from "./adapt-summary";
import { BudgetBenchmarkCard } from "./BudgetBenchmarkCard";
import { CategoryRow } from "./CategoryRow";
import { PaymentRow } from "./PaymentRow";
import { UpcomingPaymentsSection } from "./UpcomingPaymentsSection";
import { useCategoryBenchmarks } from "./use-category-benchmarks";
import { WeddingHeadline } from "./WeddingHeadline";

// 행들을 감싸는 컨테이너. `first:`/`last:` 변이는 **형제 중 첫/마지막**을 보는데 `Card` 가 `<h2>`
// 제목을 먼저 렌더하므로, 감싸지 않으면 첫 행이 `:first-child` 가 되지 못해 위 패딩이 남는다.
const ROWS = "flex flex-col";

// 온보딩 시 항상 생기는 카테고리 무관 "범용" 타임라인 항목(category_code=null, 예: "결혼 날짜
// 후보 확정")의 표시 라벨 — 레드팀 감사 라운드 2, HIGH. 이전엔 이 값을 non-nullable 타입으로
// 잘못 선언해 `?? item.category_code`가 `undefined ?? null`이 돼 문자열 "null"이 그대로 찍혔다.
const GENERAL_CATEGORY_LABEL = "일반";

// summary 로딩/에러 중 useCategoryBenchmarks에 넘길 안정된 빈 배열 — 매 렌더 새 리터럴(`[]`)을
// 넘기면 그 훅의 `useEffect` deps가 매번 바뀐 것으로 보여 getCategories()를 계속 다시 부른다.
const NO_CATEGORIES: readonly DashboardCategorySummary[] = [];

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(() => {
    setError(null);
    let cancelled = false;
    getDashboardSummary()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "대시보드를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // 언마운트 후 setState 를 막는다 — 탭 전환이 빨라 응답이 늦게 와도 경고 없이 무시된다.
    return fetchSummary();
  }, [fetchSummary]);

  // category_code → name_ko 맵. `PaymentRow` 가 `upcoming_items` 의 category_code 를 사람이
  // 읽는 이름으로 보여줄 때 쓴다 — 같은 응답 안의 `categories[]` 가 이미 그 매핑을 갖고 있으므로
  // 별도 조회 없이 재사용한다(§25 "이 응답 하나로 전부 그려진다" 원칙 유지).
  const categoryLabelByCode = useMemo(() => {
    const map = new Map<string, string>();
    summary?.categories.forEach((category) => map.set(category.category_code, category.name_ko));
    return map;
  }, [summary]);

  function resolveCategoryLabel(categoryCode: string | null): string {
    if (categoryCode === null) return GENERAL_CATEGORY_LABEL;
    return categoryLabelByCode.get(categoryCode) ?? categoryCode;
  }

  // summary가 null인 동안(로딩/에러)에도 훅은 호출돼야 한다(Hooks 규칙 — 조건부 호출 금지) —
  // 빈 배열을 넘기면 훅 내부에서 아무 조회도 하지 않는다.
  const { hasBenchmarkByCode, benchmarkByCode } = useCategoryBenchmarks(summary?.categories ?? NO_CATEGORIES);

  if (error !== null) {
    return (
      <Page title="대시보드" width="max-w-none">
        <p role="alert" className="rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
          {error}
        </p>
        <button
          type="button"
          onClick={fetchSummary}
          className="mt-3 min-h-tap rounded-md border border-line bg-surface px-4 text-sm font-bold text-ink enabled:hover:bg-surface-2"
        >
          다시 시도
        </button>
      </Page>
    );
  }

  if (summary === null) {
    return (
      <Page title="대시보드" width="max-w-none">
        <p className="text-sm text-ink-soft">불러오는 중…</p>
      </Page>
    );
  }

  const headline = adaptHeadline(summary);
  const categories = adaptCategories(summary.categories);

  return (
    <Page title="대시보드" width="max-w-none">
      <WeddingHeadline
        dDay={headline.dDay}
        dateLabel={headline.dateLabel}
        weddingDate={summary.wedding_date}
        onDateSaved={() => fetchSummary()}
      />

      <BudgetBenchmarkCard benchmark={summary.budget_benchmark} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-5">
        <Card title="다가오는 할 일">
          {summary.upcoming_items.length === 0 ? (
            <p className="text-sm text-ink-soft">다가오는 할 일이 없습니다.</p>
          ) : (
            <div className={ROWS}>
              {summary.upcoming_items.map((item) => (
                <PaymentRow key={item.id} item={item} categoryLabel={resolveCategoryLabel(item.category_code)} />
              ))}
            </div>
          )}
        </Card>

        <UpcomingPaymentsSection />

        <Card title="카테고리별 체크리스트 · 시세비교">
          {categories.length === 0 ? (
            <p className="text-sm text-ink-soft">등록된 카테고리가 없습니다.</p>
          ) : (
            <div className={ROWS}>
              {categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  hasBenchmark={hasBenchmarkByCode.get(category.id) ?? false}
                  benchmark={benchmarkByCode.get(category.id)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}
