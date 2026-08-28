// S6 예산 재배분 — 시각 스펙: docs/mockups/s6-budget-scenario.html,
// 구조(보기→시나리오 편집→저장/취소) 재검증 근거: docs/wedding/plan/new/12_final_prototype_mockup.html
// renderBudget() — 읽기전용 보기 화면과 "예산 시나리오 조정하기"로 진입하는 별도 편집 모드를
// 분리한다. 편집은 취소 가능한 초안(draft)이고, 저장해야만 실제로 반영된다.
//
// **이미 지급한 금액만큼 "잠김"** — `paid_amount`보다 낮게는 못 내린다(이미 쓴 돈이므로).
// 슬라이더의 `min`은 항상 0으로 두고(그래야 트랙 기준 잠김 구간 폭을 그릴 수 있다), 대신
// `onValueChange`에서 clamp한다.
//
// **목업과 의도적으로 단순화한 점 — 근거를 남긴다.**
// 목업은 "카테고리 간 이동만"(총예산 고정, A를 올리면 B가 자동으로 내려가는 두 슬라이더 상호
// 연동)을 그리지만, 그 실시간 상호 제약은 구현하지 않았다. 대신 각 카테고리를 독립적으로 편집
// 가능하게 하고, "남은예산"을 편집 중인 초안 기준으로 `total_budget − Σ(활성 카테고리 draft
// planned_budget)`으로 매번 다시 계산해 보여준다.
//
// **총예산 자체도 편집 가능하다** — `PATCH /weddings/me`가 `total_budget` 필드를 받고
// (03_API_spec.md #8), 그 문서 자체가 "사용 화면: S1(수정 시), S6"이라고 명시한다. 카테고리
// 재배분(PUT /wedding-categories)과는 완전히 별개의 액션이다.
//
// **UX 개편 2차(2026-08-26, 사용자 지시)** — 이 화면에서 3개 컴포넌트가 빠졌다:
//   · 결혼식 날짜 수정(`WeddingDateCard`) → 대시보드 헤드라인으로 이동
//     (`pages/dashboard/ui/WeddingHeadline.tsx`).
//   · 총예산 수정("남은예산" 카드, `TotalBudgetCard`) → 아래 "총 예산 현황"
//     카드 안 `BudgetDonut.tsx`로 흡수. "총 예산 현황"에 도넛·범례·총예산 수정이 이미 다 모여
//     있는데 남은예산만 별개 카드로 둘 이유가 없다는 판단.
// 대신 "카테고리별 예산 현황" 행에 대시보드와 같은 시세비교 줄이 새로 붙는다(`useCategoryBenchmarks`,
// `entities/wedding`로 승격됨) — 편집(슬라이더) 중엔 드래그마다 다시 조회하지 않도록
// draft가 아니라 저장된 원본 `data.categories`로만 훅을 호출한다.
//
// **UX 개편 3차(2026-08-26, 사용자 지시)** — 대시보드의 "예산 시세 비교" 카드(전체 웨딩
// 단위, 위 카테고리별 시세비교와는 별개)도 이 화면 "총 예산 현황" 카드로 흡수됐다. 그 자리를
// 비우려고 총예산 수정 트리거를 카드 제목 옆으로 옮겼다(`BudgetDonut.tsx`, `Card`의 새
// `titleAction` 슬롯). 이 페이지가 처음으로 `GET /dashboard/summary`를 직접 조회한다.
//
// **UX 개편 4차(2026-08-27, 사용자 지시)** — 카드 제목 "예산 현황" → "총 예산 현황",
// "카테고리별 배정" → "카테고리별 예산 현황"(짝을 맞춤). 카테고리별 예산 현황 행에서
// 예산 미배정인데 지출이 생긴 카테고리(예: 혼수)의 막대·금액이 0으로만 보이던 버그도
// 함께 고쳤다(`CategoryAllocationRow.tsx`) — 사용자 신고. "집행"이라는 말도 전부
// "지불"로 바꿨다.
//
// **UX 개편 5차(2026-08-29, 사용자 지시)** — 화면 순서를 「총 예산 현황(도넛) → 다가오는 결제 →
// 비용 관리 → 카테고리별 예산 현황」으로 바꿨다. 전체 요약을 맨 위에 두고 상세로 내려가는
// 순서다. 도넛과 카테고리별 목록을 한 덩어리로 렌더하던 `AllocationOverview.tsx`는 그 사이에
// 다른 섹션이 끼게 되면서 성립하지 않아 없앴다 — 목록 쪽은 `CategoryAllocationList.tsx`로
// 옮겼고, 도넛은 이 파일이 직접 그린다.
//
// **UX 개편 6차(2026-08-29, 사용자 지시) — 배분이 총예산을 넘으면 저장을 막는다.**
// 온보딩 8단계가 2026-08-28에 받은 것과 같은 가드다. 예전엔 초과 상태로 "저장"을 누를 수 있었고,
// `PUT /wedding-categories`가 400 BUDGET_EXCEEDED를 낸 뒤에야 서버 메시지로 알 수 있었다 —
// 서버 왕복을 한 번 낭비하고, 고치려면 화면 맨 위 도넛까지 스크롤해 "수정"을 찾아야 했다.
// 이제 저장 버튼 아래 안내가 이유와 함께 총예산을 올리는 길(CTA)을 준다.
import { useEffect, useRef, useState } from "react";
import { getDashboardSummary, type BudgetBenchmarkSummary } from "@/entities/dashboard";
import { getUpcomingPayments, UpcomingPaymentsCard, type UpcomingPaymentEntry } from "@/entities/payment";
import { deriveBudgetSummary, getCategories, getMyWedding, getWeddingCategories, putWeddingCategories, type WeddingCategory } from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { Page, StatusCallout } from "@/shared/ui";
import { BudgetDonut } from "./BudgetDonut";
import { CategoryAllocationList } from "./CategoryAllocationList";
import { CostManagementTab } from "./CostManagementTab";
import { useCategoryBenchmarks } from "./use-category-benchmarks";

// 서버가 D-day까지 계산해 준다(backend/app/routers/budget.py) — 프론트에서 날짜 계산을 다시 하지 않는다.
const UPCOMING_PAYMENT_WINDOW_DAYS = 30;

interface BudgetData {
  totalBudget: number;
  categories: WeddingCategory[];
  /** `WeddingCategory`(GET /wedding-categories)엔 `has_cost`가 없다 — 비용 유무는 카테고리
      상수(`GET /categories`)만 안다. "비용 없음" 카테고리는 슬라이더/바 대신 안내 텍스트만
      보여주려면 이 조회가 하나 더 필요하다 — 하드코딩 대신 응답을 그대로 따른다. */
  hasCostByCode: ReadonlyMap<string, boolean>;
  /** "비용 관리" 섹션이 결제 목록의 category_code를 사람이 읽는 이름으로 보여줄 때 쓴다. */
  categoryLabelByCode: ReadonlyMap<string, string>;
  /** has_cost인 카테고리만 — "비용 관리"의 새 결제 추가 폼(AddPaymentRow)이 카테고리 선택
      드롭다운에 쓴다. 비용 개념이 없는 카테고리(MEETING 등)엔 결제를 만들 수 없게 미리 거른다. */
  costEligibleCategoryOptions: readonly { code: string; name_ko: string }[];
}

const PRIMARY_BUTTON = "min-h-tap rounded-md bg-primary px-4 text-sm font-bold text-surface disabled:opacity-50";
// 링크가 아니라 화면 안 동작이라 <button> 이다. 밑줄은 "누를 수 있다"를 색 말고도 전달한다
// (D6 — 상태색만으로 의미를 싣지 않는다). 온보딩 8단계의 같은 CTA와 같은 리터럴이다.
const OVER_CTA = "min-h-tap w-fit text-left text-sm font-bold text-primary underline";

// data가 아직 없는 동안(로딩/에러)에도 useCategoryBenchmarks 훅은 호출돼야 한다(Hooks 규칙 —
// 조건부 호출 금지) — 매 렌더 새 배열 리터럴(`[]`)을 넘기면 그 훅의 useEffect deps가 매번
// 바뀐 것으로 보여 getCategories()를 계속 다시 부른다(DashboardPage.tsx의 NO_CATEGORIES와 같은 이유).
const NO_CATEGORIES: readonly WeddingCategory[] = [];

export function BudgetPage() {
  const [data, setData] = useState<BudgetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upcomingPayments, setUpcomingPayments] = useState<UpcomingPaymentEntry[] | null>(null);
  // 총예산 vs 지역 시세 — 대시보드의 "예산 시세 비교" 카드가 여기로 옮겨오면서(UX 개편 3차,
  // 2026-08-26, 사용자 지시) 이 페이지도 GET /dashboard/summary를 직접 조회해야 한다. 이 필드
  // 전용으로 별도 백엔드 엔드포인트를 새로 만들지 않고 기존 대시보드 응답을 재사용한다 —
  // 카테고리/결제 등 나머지 필드는 그냥 버린다. `data`(BudgetData)에 넣지 않고 위
  // upcomingPayments처럼 독립 state로 둔다 — 아래 effect가 위 초기 로드 effect보다 먼저
  // 끝나도 `data`가 아직 null이라 값을 잃어버리는 경쟁 상태를 피하기 위해서다.
  const [budgetBenchmark, setBudgetBenchmark] = useState<BudgetBenchmarkSummary | null>(null);

  // 시나리오 편집 — null이면 읽기전용 보기, 값이 있으면 초안 편집 중. `data.categories`를 직접
  // 고치지 않고 사본을 따로 들고 있어야 "‹ 뒤로"(취소)가 저장 없이 원래 값으로 돌아갈 수 있다.
  const [scenarioDraft, setScenarioDraft] = useState<WeddingCategory[] | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // 저장 실패 시 백엔드가 준 구체적 사유(예: "배정 합계가 예산을 3,000,000원 초과합니다.")를
  // 담는다 — 이전엔 catch가 이 메시지를 버리고 항상 같은 범용 문구만 보여줬다(레드팀 감사 HIGH,
  // 교차 패턴 04). 초기 로드 catch는 이미 ApiError.message를 쓰는 관례가 있었는데 저장 함수
  // 두 곳만 그 관례를 안 따르고 있었다.
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // 총예산 수정 패널 열림 — BudgetDonut 내부가 아니라 여기 있다. 초과 안내의 CTA가 화면
  // 아래에서 이 패널을 열어야 하기 때문이다(BudgetDonut.tsx 머리말).
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const donutRef = useRef<HTMLDivElement>(null);

  // CTA는 화면 맨 아래에 있고 패널은 맨 위 카드에 있다 — 스크롤이 없으면 "아무 일도 안 일어난
  // 것"처럼 보인다. 입력칸 포커스는 DisclosurePanel이 스스로 한다.
  // `behavior: "smooth"`를 쓰지 않는 이유 — styles.css의 전역 prefers-reduced-motion 규칙은
  // animation/transition duration만 덮어 `scroll-behavior`는 잡지 못한다. 기본값(즉시 이동)이
  // 그 환경에서 안전하다.
  function openTotalBudgetEditor() {
    setIsEditingTotal(true);
    donutRef.current?.scrollIntoView({ block: "start" });
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyWedding(), getWeddingCategories(), getCategories()])
      .then(([wedding, categoriesResponse, constants]) => {
        if (!cancelled) {
          const sorted = categoriesResponse.categories.toSorted((a, b) => a.display_order - b.display_order);
          setData({
            totalBudget: wedding.total_budget ?? 0,
            categories: sorted,
            hasCostByCode: new Map(constants.categories.map((c) => [c.code, c.has_cost])),
            categoryLabelByCode: new Map(constants.categories.map((c) => [c.code, c.name_ko])),
            costEligibleCategoryOptions: constants.categories
              .filter((c) => c.has_cost)
              .toSorted((a, b) => a.display_order - b.display_order)
              .map((c) => ({ code: c.code, name_ko: c.name_ko })),
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "예산 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getUpcomingPayments(UPCOMING_PAYMENT_WINDOW_DAYS)
      .then((res) => {
        if (!cancelled) setUpcomingPayments(res.payments);
      })
      .catch(() => {
        // 다가오는 결제는 보조 위젯이다 — 실패해도 예산 재배분 본문은 그대로 보여준다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 시세 비교(budgetBenchmark)도 위 다가오는 결제와 같은 이유로 별도 effect다 — 위 Promise.all에
  // 넣으면 이 조회 하나가 실패해도 예산 재배분 본문 전체가 에러 화면으로 덮인다. 이 값은 원래도
  // "지역에 참가격 데이터가 없으면 null"인 선택적 카드였다(예전 BudgetBenchmarkCard.tsx) — 조회
  // 실패도 그 null과 같은 모양으로 조용히 흡수한다.
  useEffect(() => {
    let cancelled = false;
    getDashboardSummary()
      .then((res) => {
        if (!cancelled) setBudgetBenchmark(res.budget_benchmark);
      })
      .catch(() => {
        // 조용히 흡수 — budgetBenchmark는 이미 null로 시작하므로 카드가 그냥 안 뜬다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 편집(슬라이더) 중에도 draft가 아니라 원본 data.categories로만 호출한다 — 드래그마다
  // GET /benchmarks/compare를 다시 부르지 않기 위해서다(카테고리별 예산 현황 행의 시세비교는
  // "저장된 값 기준"이라는 뜻).
  const { hasBenchmarkByCode, benchmarkByCode } = useCategoryBenchmarks(data?.categories ?? NO_CATEGORIES);

  // 비용 관리 섹션에서 결제가 새로 등록되면(특히 paid_date 있는 건 — 서버가 status=PAID로
  // 자동 유도) 그 카테고리의 paid_amount가 바뀐다. 도넛(deriveBudgetSummary)과 「카테고리별
  // 배정」 목록이 낡은 값을 보여주지 않게 카테고리만 다시 불러온다 — 총예산/날짜는 그 액션과
  // 무관하니 건드리지 않는다. 시나리오 편집 중에 호출돼도 안전하다 — draft는 그대로 두고
  // `data.categories`(원본)만 갱신한다.
  function refetchCategories() {
    getWeddingCategories()
      .then((res) => {
        const sorted = res.categories.toSorted((a, b) => a.display_order - b.display_order);
        setData((prev) => (prev ? { ...prev, categories: sorted } : prev));
      })
      .catch(() => {
        // 비용 관리는 이미 성공적으로 결제를 저장했다 — 이 재조회 실패로 그 성공까지 에러로
        // 덮지 않는다. 다음에 페이지를 새로고침하면 어차피 최신값을 받는다.
      });
  }

  function startScenario() {
    if (!data) return;
    setScenarioDraft(data.categories.map((category) => ({ ...category })));
    setSaveState("idle");
    setSaveErrorMessage(null);
  }

  function cancelScenario() {
    setScenarioDraft(null);
    setSaveState("idle");
    setSaveErrorMessage(null);
  }

  function updateDraftBudget(categoryCode: string, plannedBudget: number) {
    setScenarioDraft((prev) =>
      prev
        ? prev.map((category) =>
            category.category_code === categoryCode ? { ...category, planned_budget: plannedBudget } : category,
          )
        : prev,
    );
    setSaveState("idle"); // 다시 건드리면 "저장됨" 표시를 지운다 — 이후 값은 아직 저장 전이므로.
    setSaveErrorMessage(null);
  }

  async function handleSaveScenario() {
    if (!data || !scenarioDraft) return;
    setSaveState("saving");
    setSaveErrorMessage(null);
    try {
      // PUT은 카테고리 배열 전체를 요구한다(부분 갱신 아님) — 편집하지 않은 필드는 조회값 그대로
      // 되돌려 보낸다. `selected_options`/`skip_reason`은 이 화면이 다루지 않으므로 원본을 보존한다.
      await putWeddingCategories(
        scenarioDraft.map((category) => ({
          category_code: category.category_code,
          is_active: category.is_active,
          planned_budget: category.planned_budget,
          selected_options: category.selected_options,
          display_order: category.display_order,
        })),
      );
      setData((prev) => (prev ? { ...prev, categories: scenarioDraft } : prev));
      setScenarioDraft(null); // 저장 성공 시 보기 모드로 복귀 — 목업의 "이 배분으로 저장" 커밋과 같은 의미.
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setSaveErrorMessage(err instanceof ApiError ? err.message : "저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  if (error !== null) {
    return (
      <Page title="예산 재배분" subtitle="카테고리 사이로 예산을 옮겨 봅니다.">
        <p role="alert" className="rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
          {error}
        </p>
      </Page>
    );
  }

  if (data === null) {
    return (
      <Page title="예산 재배분" subtitle="카테고리 사이로 예산을 옮겨 봅니다.">
        <p className="text-sm text-ink-soft">불러오는 중…</p>
      </Page>
    );
  }

  // 보기 모드에선 원본(data.categories)을, 시나리오 편집 중엔 초안(scenarioDraft)을 그린다 —
  // 편집 중 화면과 저장된 값이 같은 렌더 경로를 타되 데이터 출처만 갈린다.
  const rows = scenarioDraft ?? data.categories;
  const isEditingScenario = scenarioDraft !== null;

  // 🚨 **서버와 같은 집합으로 센다.** `PUT /wedding-categories`의 BUDGET_EXCEEDED 검증은
  // `is_active` 무관 **9개 전체 합**이다(01-endpoints.md:149). 반면 deriveBudgetSummary 의
  // `unallocated`는 활성만 센다 — 그걸로 게이트를 만들면 "화면은 통과인데 서버가 400"이 난다.
  // `rows`는 CategoryAllocationList 가 전부 렌더하는 그 배열, 즉 비활성 포함 전체다.
  //
  // 대안(비활성은 payload에 0으로 보내 서버를 우리 쪽에 맞추기)은 택하지 않았다 — 비활성
  // 카테고리에 paid_amount 가 있으면(비용 관리의 카테고리 목록은 has_cost 로만 거른다) 0을
  // 보내는 순간 BUDGET_BELOW_PAID 400 이 새로 생긴다. 판정 집합만 맞추는 쪽이 부작용이 없다.
  const plannedTotal = rows.reduce((sum, category) => sum + category.planned_budget, 0);
  const isOverAllocated = plannedTotal > data.totalBudget;

  return (
    <Page title="예산 재배분" subtitle="카테고리 사이로 예산을 옮겨 봅니다.">
      <div className="flex flex-col gap-5">
        {/* 대시보드에 있던 도넛을 이 화면으로 옮겼다(UX 개편 2차, 2026-08-26) — deriveBudgetSummary가
            draft-aware한 rows를 받으므로, 시나리오 편집 중 슬라이더를 움직이면 도넛도 같이
            움직인다(entities/wedding/model/derive-budget-summary.ts 머리말 — 예전 대시보드
            도넛의 "미배정이 거의 항상 안 그려지던" 버그도 여기서 함께 고쳐졌다).
            UX 개편 3차(2026-08-26)로 대시보드의 "예산 시세 비교" 카드도 여기 흡수됐다 —
            BudgetDonut이 자기 Card(제목 "총 예산 현황" + titleAction 수정 버튼)를 직접 그리므로
            여기서는 Card로 감싸지 않는다. */}
        {/* 감싸는 div 는 초과 안내 CTA 가 스크롤해 올 목적지다 — Card 는 ref 를 받지 않는다. */}
        <div ref={donutRef}>
          <BudgetDonut
            summary={deriveBudgetSummary(rows, data.totalBudget)}
            onTotalBudgetSaved={(nextTotal) => setData((prev) => (prev ? { ...prev, totalBudget: nextTotal } : prev))}
            benchmark={budgetBenchmark}
            isEditing={isEditingTotal}
            onIsEditingChange={setIsEditingTotal}
          />
        </div>

        {upcomingPayments !== null && (
          <UpcomingPaymentsCard payments={upcomingPayments} windowDays={UPCOMING_PAYMENT_WINDOW_DAYS} />
        )}

        <CostManagementTab
          categoryLabelByCode={data.categoryLabelByCode}
          categoryOptions={data.costEligibleCategoryOptions}
          onPaymentsChanged={refetchCategories}
        />

        <CategoryAllocationList
          rows={rows}
          originalCategories={data.categories}
          totalBudget={data.totalBudget}
          hasCostByCode={data.hasCostByCode}
          hasBenchmarkByCode={hasBenchmarkByCode}
          benchmarkByCode={benchmarkByCode}
          isEditingScenario={isEditingScenario}
          onDraftChange={updateDraftBudget}
        />

        {/* gap 없는 래퍼 — StatusCallout 의 <output> 은 숨어도(안쪽만 display:none) 여전히 flex
            아이템이라, 바깥 `gap-5` 의 형제로 두면 초과가 아닐 때도 20px 빈 줄이 남는다.
            여백은 그 컴포넌트 자신의 mt-4 가 낸다. */}
        <div className="flex flex-col">
          {isEditingScenario ? (
            <div className="flex items-center gap-3">
              {/* 저장 진행 중엔 뒤로가기를 막는다 — 안 막으면 이미 시작된 저장 요청이 취소된 뒤에도
                  진행돼, 성공 시 취소했던 배분 결과가 그대로 되살아난다(레드팀 감사 HIGH).
                  초과 상태에서도 뒤로는 막지 않는다 — 초안을 버리는 것이라 안전하고, 배분을 더
                  내릴 수 없는 경우(paid_amount 하한)의 유일한 탈출구다. */}
              <button
                type="button"
                onClick={cancelScenario}
                disabled={saveState === "saving"}
                className="text-sm font-bold text-ink-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span aria-hidden="true">‹</span> 뒤로
              </button>
              <button
                type="button"
                onClick={() => void handleSaveScenario()}
                disabled={saveState === "saving" || isOverAllocated}
                className={PRIMARY_BUTTON}
              >
                {saveState === "saving" ? "저장 중…" : "저장"}
              </button>
              {/* D6 — 상태색 없이 텍스트만으로 저장 결과를 전달한다. */}
              {saveState === "error" && (
                <span role="alert" className="text-sm text-primary">
                  {saveErrorMessage}
                </span>
              )}
            </div>
          ) : (
            <button type="button" onClick={startScenario} className={PRIMARY_BUTTON}>
              예산 조정하기
            </button>
          )}

          {/* 보기 모드에서도 띄운다(2026-08-29 사용자 결정) — 도넛의 "수정"으로 총예산만 낮추면
              바로 초과 상태가 된다(PATCH /weddings/me 는 배분 합계를 검증하지 않는다). 그 경로로
              들어온 사용자에게도 고치는 길을 준다. */}
          <StatusCallout shown={isOverAllocated}>
            <p className="text-sm font-bold text-primary">설정한 예산이 총예산을 초과했어요.</p>
            <button type="button" className={OVER_CTA} onClick={openTotalBudgetEditor}>
              총예산 금액을 조정할까요?
            </button>
          </StatusCallout>
        </div>
        {!isEditingScenario && saveState === "saved" && <output className="text-sm text-ink-soft">저장됐어요</output>}
      </div>
    </Page>
  );
}
