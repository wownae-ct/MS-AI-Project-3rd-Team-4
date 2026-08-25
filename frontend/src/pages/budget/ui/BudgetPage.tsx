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
// 재배분(PUT /wedding-categories)과는 완전히 별개의 액션이라 별도 상태로 관리한다.
import { useEffect, useState } from "react";
import { getUpcomingPayments, type UpcomingPaymentEntry } from "@/entities/payment";
import {
  getCategories,
  getMyWedding,
  getWeddingCategories,
  putWeddingCategories,
  updateMyWedding,
  type WeddingCategory,
} from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { manwonToWon, wonToManwon } from "@/shared/lib/money";
import { Card, Money, Page } from "@/shared/ui";
import { CategoryAllocationRow } from "./CategoryAllocationRow";
import { UpcomingPaymentsCard } from "./UpcomingPaymentsCard";

// 서버가 D-day까지 계산해 준다(backend/app/routers/budget.py) — 프론트에서 날짜 계산을 다시 하지 않는다.
const UPCOMING_PAYMENT_WINDOW_DAYS = 30;

interface BudgetData {
  totalBudget: number;
  categories: WeddingCategory[];
  /** `WeddingCategory`(GET /wedding-categories)엔 `has_cost`가 없다 — 비용 유무는 카테고리
      상수(`GET /categories`)만 안다. "비용 없음" 카테고리는 슬라이더/바 대신 안내 텍스트만
      보여주려면 이 조회가 하나 더 필요하다 — 하드코딩 대신 응답을 그대로 따른다. */
  hasCostByCode: ReadonlyMap<string, boolean>;
}

const INLINE_INPUT =
  "w-28 rounded-md border border-line bg-surface px-2.5 py-1.5 text-right text-sm text-ink " +
  "[font-variant-numeric:tabular-nums] focus-visible:border-primary";
const GHOST_BUTTON = "text-xs font-bold text-ink-soft transition-colors duration-150 hover:text-primary";
const PRIMARY_BUTTON = "rounded-md bg-primary px-4 py-2 text-sm font-bold text-surface disabled:opacity-50";

export function BudgetPage() {
  const [data, setData] = useState<BudgetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upcomingPayments, setUpcomingPayments] = useState<UpcomingPaymentEntry[] | null>(null);

  // 시나리오 편집 — null이면 읽기전용 보기, 값이 있으면 초안 편집 중. `data.categories`를 직접
  // 고치지 않고 사본을 따로 들고 있어야 "‹ 뒤로"(취소)가 저장 없이 원래 값으로 돌아갈 수 있다.
  const [scenarioDraft, setScenarioDraft] = useState<WeddingCategory[] | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // 저장 실패 시 백엔드가 준 구체적 사유(예: "배정 합계가 예산을 3,000,000원 초과합니다.")를
  // 담는다 — 이전엔 catch가 이 메시지를 버리고 항상 같은 범용 문구만 보여줬다(레드팀 감사 HIGH,
  // 교차 패턴 04). 초기 로드 catch는 이미 ApiError.message를 쓰는 관례가 있었는데 저장 함수
  // 두 곳만 그 관례를 안 따르고 있었다.
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // 총예산 인라인 편집 — 카테고리 시나리오와 무관한 별도 액션(위 머리말 참조).
  const [totalBudgetDraft, setTotalBudgetDraft] = useState<string | null>(null);
  const [totalBudgetSaveState, setTotalBudgetSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [totalBudgetErrorMessage, setTotalBudgetErrorMessage] = useState<string | null>(null);

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

  function startEditTotalBudget() {
    if (!data) return;
    setTotalBudgetDraft(String(wonToManwon(data.totalBudget)));
    setTotalBudgetSaveState("idle");
    setTotalBudgetErrorMessage(null);
  }

  function cancelEditTotalBudget() {
    setTotalBudgetDraft(null);
    setTotalBudgetSaveState("idle");
    setTotalBudgetErrorMessage(null);
  }

  async function handleSaveTotalBudget() {
    if (!data || totalBudgetDraft === null) return;
    const nextTotal = manwonToWon(Number(totalBudgetDraft));
    setTotalBudgetSaveState("saving");
    setTotalBudgetErrorMessage(null);
    try {
      await updateMyWedding({ total_budget: nextTotal });
      setData((prev) => (prev ? { ...prev, totalBudget: nextTotal } : prev));
      setTotalBudgetDraft(null);
      setTotalBudgetSaveState("idle");
    } catch (err) {
      setTotalBudgetSaveState("error");
      setTotalBudgetErrorMessage(err instanceof ApiError ? err.message : "총예산을 저장하지 못했어요. 다시 시도해 주세요.");
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
  const activeRows = rows.filter((category) => category.is_active);
  const allocated = activeRows.reduce((sum, category) => sum + category.planned_budget, 0);
  const remaining = data.totalBudget - allocated;

  return (
    <Page title="예산 재배분" subtitle="카테고리 사이로 예산을 옮겨 봅니다.">
      <div className="flex flex-col gap-5">
        <Card title="남은예산">
          <div className="flex items-baseline justify-between">
            <Money value={remaining} className="text-2xl" />
            {totalBudgetDraft === null ? (
              <span className="flex items-center gap-2 text-xs text-ink-soft">
                총예산 {data.totalBudget.toLocaleString("ko-KR")}원 중
                {/* 카테고리 재배분과 별개 액션이라, 시나리오 편집 중에도(isEditingScenario 무관)
                    항상 눌러볼 수 있게 둔다 — 다만 실제로 편집 UI가 뜨면 아래 브랜치로 넘어간다. */}
                <button type="button" onClick={startEditTotalBudget} className={GHOST_BUTTON}>
                  수정
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={totalBudgetDraft}
                  onChange={(event) => setTotalBudgetDraft(event.target.value)}
                  className={INLINE_INPUT}
                  aria-label="총예산(만원)"
                />
                <span className="text-xs text-ink-soft">만원</span>
                <button
                  type="button"
                  onClick={() => void handleSaveTotalBudget()}
                  disabled={totalBudgetSaveState === "saving"}
                  className={GHOST_BUTTON}
                >
                  {totalBudgetSaveState === "saving" ? "저장 중…" : "저장"}
                </button>
                {/* 저장 진행 중엔 취소를 막는다 — 안 막으면 draft 를 null 로 되돌린 뒤에도
                    이미 시작된 저장 함수가 클릭 시점 draft 로 계속 진행해 성공 시 그 값을
                    되살린다(레드팀 감사 HIGH, BudgetPage.tsx:285 와 같은 패턴). */}
                <button
                  type="button"
                  onClick={cancelEditTotalBudget}
                  disabled={totalBudgetSaveState === "saving"}
                  className={GHOST_BUTTON}
                >
                  취소
                </button>
              </span>
            )}
          </div>
          {totalBudgetSaveState === "error" && (
            <p role="alert" className="mt-1.5 text-xs text-primary">
              {totalBudgetErrorMessage}
            </p>
          )}
        </Card>

        {upcomingPayments !== null && (
          <UpcomingPaymentsCard payments={upcomingPayments} windowDays={UPCOMING_PAYMENT_WINDOW_DAYS} />
        )}

        <Card title="카테고리별 배정">
          <div>
            {rows.map((category) => {
              const hasCost = data.hasCostByCode.get(category.category_code) ?? true;
              const original = data.categories.find((c) => c.category_code === category.category_code);
              const originalAmount = original?.planned_budget ?? category.planned_budget;
              return (
                <CategoryAllocationRow
                  key={category.category_code}
                  category={category}
                  hasCost={hasCost}
                  totalBudget={data.totalBudget}
                  isEditingScenario={isEditingScenario}
                  originalAmount={originalAmount}
                  onDraftChange={updateDraftBudget}
                />
              );
            })}
          </div>
        </Card>

        {isEditingScenario ? (
          <div className="flex items-center gap-3">
            {/* 저장 진행 중엔 뒤로가기를 막는다 — 안 막으면 이미 시작된 저장 요청이 취소된 뒤에도
                진행돼, 성공 시 취소했던 배분 결과가 그대로 되살아난다(레드팀 감사 HIGH). */}
            <button
              type="button"
              onClick={cancelScenario}
              disabled={saveState === "saving"}
              className="text-sm font-bold text-ink-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              ‹ 뒤로
            </button>
            <button
              type="button"
              onClick={() => void handleSaveScenario()}
              disabled={saveState === "saving"}
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
        {!isEditingScenario && saveState === "saved" && <span className="text-sm text-ink-soft">저장됐어요</span>}
      </div>
    </Page>
  );
}
