// "카테고리별 예산 현황" 카드 — 예전 `AllocationOverview.tsx`에서 도넛과 한 덩어리로 묶여
// 있던 아래쪽 절반이다.
//
// **분리 이유(2026-08-29, 사용자 지시)** — 화면 배치가 「총 예산 현황(도넛) → 다가오는 결제 →
// 비용 관리 → 카테고리별 예산 현황」으로 바뀌면서, 도넛과 이 목록 **사이에** 다른 섹션이 끼게
// 됐다. 둘을 한 컴포넌트가 연달아 렌더하던 구조로는 그 순서를 만들 수 없어 파일을 갈랐다.
// (AllocationOverview는 원래 BudgetPage의 모듈 의존성 상한(`import/max-dependencies`, 10)을
// 넘기지 않으려고 만든 묶음이었다.)
//
// **비활성 카테고리 제외(2026-08-29, 레드팀 감사 #21, 사용자 결정)** — 온보딩에서 끈 카테고리가
// 이 목록에만 활성과 똑같은 모습으로 남아 있었다. 대시보드(`GET /dashboard/summary`)와 타임라인
// (`GET /timeline-items`)은 서버가 비활성을 걸러서 주는데, 이 화면이 쓰는
// `GET /wedding-categories`만 9개 전체를 준다 — 그래서 거르는 일이 프론트 몫이다.
//
// ⚠️ **거르는 곳이 여기여야 한다.** BudgetPage 가 넘겨주는 `rows` 를 그쪽에서 미리 걸러 버리면
// 같은 배열을 쓰는 `plannedTotal`(총예산 초과 게이트)까지 활성만 세게 되는데, 서버의
// BUDGET_EXCEEDED 검증은 `is_active` 무관 9개 전체 합이라(01-endpoints.md:149) "화면은 통과인데
// 저장이 400" 이 난다. **표시만 거르고 계산 집합은 건드리지 않는다.**
//
// **비용 없는 카테고리도 제외한다(2026-08-29, 사용자 결정)** — `has_cost=false` 인 행은 금액도
// 막대도 슬라이더도 없이 이름과 "비용 없음" 만 그렸다. 이 목록에서 사용자가 할 수 있는 일이
// 하나도 없는 줄이라 아예 빼기로 했다.
//
// ⚠️ **지금 9개 중 해당하는 카테고리는 없다.** 한때 상견례(MEETING)가 유일한 무비용
// 카테고리였지만 2026-08-29 제품 확인으로 유상이 됐다(backend/app/core/categories.py 의 그 줄
// 주석). 그래도 `has_cost` 는 계약에 남아 있는 플래그라 이 필터를 지우지 않는다 — 서버가 다시
// false 를 주면 슬라이더 달린 행이 조용히 생기는 것보다 안 보이는 편이 안전하다.
//
// ## 카테고리 on/off 도 이 카드가 소유한다(2026-08-29, 사용자 지시)
//
// 위 필터를 넣으면서 **끈 카테고리를 다시 켤 길이 완전히 사라졌다** — 그 UI 는 온보딩 7단계에만
// 있고, 웨딩이 생기면 라우트 가드가 온보딩 진입을 되돌린다. 그래서 제목 옆 설정 버튼으로 카드
// **본문 자체**를 「예산 현황 목록 ↔ 사용 여부 토글」로 갈아 끼운다.
//
// **왜 BudgetPage 가 아니라 여기인가** — BudgetPage 의 import 는 정확히 10개로 상한
// (`import/max-dependencies`)에 닿아 있어 새 컴포넌트를 하나도 더 들일 수 없다. 이 카드의
// 소유자가 이 파일이기도 하다(제목·틀을 여기가 그린다). BudgetPage 는 prop 만 늘린다.
//
// **왜 조건부 렌더가 아니라 `DisclosurePanel` 두 개인가** — 조건부로 갈아 끼우면 카드 높이가
// 한 프레임에 튄다(두 본문의 높이가 크게 다르다). 접히는 쪽에 전환이 돌려면 **떼어낼 수 없다**
// (조건부 렌더는 나갈 프레임이 없다) — 이 저장소가 이미 그 이유로 만들어 둔 장치가
// `DisclosurePanel` 이다(0fr↔1fr 그리드 전환 + 접힌 쪽 `inert`). 하나가 1fr→0fr, 다른 하나가
// 0fr→1fr 로 같은 200ms 를 움직여 카드 높이가 부드럽게 모핑된다. 「동작 줄이기」 환경은
// styles.css 의 전역 규칙이 이미 처리한다.
// 알려진 한계(수용): 두 본문의 높이 차가 크면 전환 중 순간적으로 높이가 살짝 부푼다. 절대 위치
// 크로스페이드 대안은 카드 높이를 잡아 줄 기준이 없어 더 불안정하다.
//
// ## 저장 대기는 이 카드 안에서 일어난다(2026-08-29 개편, 사용자 지시)
//
// 사용 여부 저장 한 번은 서버에서 체크리스트·타임라인 재생성을 **동기로** 돌린다(p95 약 46초).
// 예전엔 그 46초 내내 토글 패널이 열려 있었다 — 정작 궁금한 「내 예산 목록이 어떻게 바뀌나」를
// 못 본 채 기다리다 어느 순간 목록이 통째로 갈렸다. D21 이 타임라인·체크리스트에서 기각한 그
// 상황이라 같은 처방을 쓴다:
//
//   · **확인 즉시 패널을 접고** 목록 본문으로 돌아온다.
//   · **켜는 카테고리 자리에만** 자리표시를 세운다(`display_order` 덕에 저절로 제자리에 선다).
//     그 결과는 서버만 안다 — 지어내지 않는다.
//   · **끄는 카테고리는 기다리지 않는다.** 결과("행이 사라지고 예산이 0")를 프론트가 정확히
//     계산할 수 있어(`applyDeactivations`) 즉시 반영한다. 자리표시가 0개인 이유다.
//   · 그 동안 설정 버튼은 **자리를 남긴 채** 사라진다 — 제목 줄 높이가 안 튀고, 탭 순서와
//     접근성 트리에서도 빠진다. 완료되면 같은 자리로 돌아온다.
//
// `isManagingActivation` 은 저장 중에도 **참으로 유지된다**(패널의 `open` 만 `saving` 으로 끈다).
// 그래야 BudgetPage 의 "예산 조정하기" 잠금이 별도 state 없이 그대로 걸려, 46초짜리 재생성을
// 유발하는 PUT 둘이 겹치지 않는다.
import { useState } from "react";
import type { BenchmarkComparison } from "@/entities/payment";
import type { WeddingCategory } from "@/entities/wedding";
import { Card, DisclosurePanel, IconSettings, StatusCallout } from "@/shared/ui";
import type { ActivationDraft } from "./activation-draft";
import { CategoryActivationPanel } from "./CategoryActivationPanel";
import { CategoryAllocationRow, CategoryAllocationRowSkeleton } from "./CategoryAllocationRow";
import { useActivationSave } from "./use-activation-save";

// 아이콘 단독 버튼 — 보이는 라벨이 없어 아이콘 자체(20px)가 타겟 크기의 전부가 될 뻔했다.
// `min-h-tap`/`min-w-tap`(44px)으로 상자를 키운다(`entities/chat/ui/MessageBubble.tsx` 의 아이콘
// 단독 버튼과 같은 짝). 색 전환은 duration-150 — 크기 전환(200)과 구분하는 이 저장소 관례.
const SETTINGS_BUTTON =
  "min-h-tap inline-flex min-w-tap items-center justify-center rounded-md text-ink-soft " +
  "transition-colors duration-150 enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";
// 저장 중 그 버튼이 비운 자리. 같은 크기의 빈 상자라 카드 제목 줄 높이가 그대로다.
const SETTINGS_PLACEHOLDER = "block min-h-tap min-w-tap";

const AMOUNTS_PANEL_ID = "budget-category-amounts";
const ACTIVATION_PANEL_ID = "budget-category-activation";

const SAVED_ANNOUNCEMENT = "카테고리 설정을 저장했어요.";

export interface CategoryAllocationListProps {
  /** 보기 모드면 원본, 시나리오 편집 중이면 draft — BudgetPage가 이미 이 둘을 합쳐서 내려준다.
      비활성 포함 9개 전체가 오고, 화면에서 거르는 것은 이 컴포넌트가 한다(머리말 참고). */
  rows: readonly WeddingCategory[];
  /** originalAmount 계산 기준 — 항상 원본(draft 아님). draft 중에도 "저장 전 값"을 보여줘야 한다. */
  originalCategories: readonly WeddingCategory[];
  totalBudget: number;
  hasCostByCode: ReadonlyMap<string, boolean>;
  /** 시세비교 대상 여부/결과 — BudgetPage가 `useCategoryBenchmarks`로 한 번만 조회해 내려준다
      (2026-08-26, UX 개편 2차, 사용자 지시). 대시보드 `CategoryRow.tsx`와 같은 데이터. */
  hasBenchmarkByCode: ReadonlyMap<string, boolean>;
  benchmarkByCode: ReadonlyMap<string, BenchmarkComparison>;
  isEditingScenario: boolean;
  onDraftChange: (categoryCode: string, plannedBudget: number) => void;
  /** 사용 여부 편집 패널이 열려 있는가. 상태는 BudgetPage가 소유한다 — "예산 조정하기" 버튼도
      같은 값으로 막아야 해서(두 편집 모드의 상호 배제) 한 곳에서 들고 있어야 한다. */
  isManagingActivation: boolean;
  onManagingActivationChange: (next: boolean) => void;
  /** 사용 여부 저장 경로의 유일한 갱신 통로. `keepPanelOpen` 은 아직 끝나지 않은 갱신
      (낙관적 반영·실패 원복)이라는 뜻 — 그때는 패널 상태를 닫지 않아야 잠금이 유지된다. */
  onCategoriesSaved: (categories: WeddingCategory[], options?: { keepPanelOpen?: boolean }) => void;
}

export function CategoryAllocationList({
  rows,
  originalCategories,
  totalBudget,
  hasCostByCode,
  hasBenchmarkByCode,
  benchmarkByCode,
  isEditingScenario,
  onDraftChange,
  isManagingActivation,
  onManagingActivationChange,
  onCategoriesSaved,
}: CategoryAllocationListProps) {
  // 저장 완료 낭독. 빈 문자열로 시작해야 첫 렌더에서 "저장했어요"가 새어 나가지 않는다.
  const [announcement, setAnnouncement] = useState("");
  const { pendingActivations, saving, error, failedDraft, save, reset } = useActivationSave({
    onOptimistic: (categories) => onCategoriesSaved(categories, { keepPanelOpen: true }),
    onSaved: (categories) => {
      onCategoriesSaved(categories);
      setAnnouncement(SAVED_ANNOUNCEMENT);
    },
    onFailed: (categories) => onCategoriesSaved(categories, { keepPanelOpen: true }),
  });

  function handleSave(draft: ActivationDraft) {
    setAnnouncement("");
    save(originalCategories, draft);
  }

  // 화면에서만 거른다 — `rows` 자체는 그대로 두어야 BudgetPage 의 `plannedTotal`(서버와 같은
  // 9개 전체 합)이 어긋나지 않는다(머리말).
  //
  // `?? true` — 카테고리 상수를 아직/영영 못 받았으면 숨기지 않는다. 아는 것만 거른다.
  // 숨긴 행에 금액이 묻힐 걱정은 없다: `has_cost=false` 카테고리는 온보딩 8단계가 입력칸·
  // 슬라이더를 그리지 않고(Step8Allocation.tsx), 결제 선택지에서도 빠지며(BudgetPage.tsx
  // `costEligibleCategoryOptions`), PUT 은 조회값을 그대로 되돌려 보내므로 planned_budget 이
  // 0 이외가 될 경로가 UI 에 없다.
  //
  // 켜는 중인 카테고리는 `rows` 상 아직 비활성이지만(서버 확인 전이라 지어내지 않는다) 자리는
  // 미리 잡아야 하므로 여기서만 통과시킨다.
  const visibleRows = rows.filter(
    (category) =>
      (category.is_active || pendingActivations.has(category.category_code)) &&
      (hasCostByCode.get(category.category_code) ?? true),
  );

  // 한 카드에 편집 모드 둘이 동시에 열리면 초안이 어느 쪽 것인지 알 수 없고, 전환하는 순간
  // 배분 초안이 조용히 버려진다. 반대 방향(사용 여부 편집 중 "예산 조정하기" 막기)은 BudgetPage 가 건다.
  //
  // **패널이 열려 있는 동안에도 버튼을 감춘다**(2026-08-30, 사용자 지시) — 이 버튼은 토글이
  // 아니라 **들어가는 문**이다. 나가는 문은 패널 안의 「저장」·「취소」뿐이라, 같은 자리에
  // 되돌리기 버튼을 남겨 두면 그 셋이 서로 다른 뜻으로 같은 일을 하는 것처럼 보인다
  // (⚙ 로 되돌리면 만지던 초안이 아무 예고 없이 버려진다 — 취소와 결과는 같은데 확인이 없다).
  //
  // 저장 중에도 같은 이유로 감춘다. 둘 다 버튼 대신 같은 크기의 빈 상자를 낸다 — 비활성
  // 버튼으로 남기면 `aria-controls`/`aria-expanded` 가 그대로 남아 상태를 잘못 말하고,
  // 아예 렌더하지 않으면 카드 제목 줄 높이가 44px ↔ 20px 로 튄다.
  const settingsButton = saving || isManagingActivation ? (
    <span className={SETTINGS_PLACEHOLDER} aria-hidden="true" />
  ) : (
    <button
      type="button"
      className={SETTINGS_BUTTON}
      aria-label="카테고리 사용 여부 설정"
      aria-expanded={isManagingActivation}
      aria-controls={ACTIVATION_PANEL_ID}
      disabled={isEditingScenario}
      onClick={() => onManagingActivationChange(!isManagingActivation)}
    >
      <IconSettings />
    </button>
  );

  return (
    <Card title="카테고리별 예산 현황" titleAction={settingsButton}>
      {/* `divider={false}` — 이 둘은 트리거 아래로 펼치는 패널이 아니라 카드 **본문 교체**라
          위에 가를 것이 없다. `focusOnOpen={false}` — 이 패널의 첫 컨트롤은 입력칸이 아니고
          (슬라이더/스위치), 사용자가 방금 누른 설정 버튼에 포커스를 남기는 편이 다시 눌러
          되돌리기에 자연스럽다.
          `|| saving` / `&& !saving` — 저장을 시작하는 순간 목록 본문으로 되돌아온다(머리말). */}
      <DisclosurePanel id={AMOUNTS_PANEL_ID} open={!isManagingActivation || saving} focusOnOpen={false} divider={false}>
        <div>
          {visibleRows.map((category) => {
            if (pendingActivations.has(category.category_code)) {
              return (
                <CategoryAllocationRowSkeleton
                  key={category.category_code}
                  hasBenchmark={hasBenchmarkByCode.get(category.category_code) ?? false}
                />
              );
            }
            const original = originalCategories.find((c) => c.category_code === category.category_code);
            const originalAmount = original?.planned_budget ?? category.planned_budget;
            return (
              <CategoryAllocationRow
                key={category.category_code}
                category={category}
                totalBudget={totalBudget}
                hasBenchmark={hasBenchmarkByCode.get(category.category_code) ?? false}
                benchmark={benchmarkByCode.get(category.category_code)}
                isEditingScenario={isEditingScenario}
                originalAmount={originalAmount}
                onDraftChange={onDraftChange}
              />
            );
          })}
        </div>
      </DisclosurePanel>

      {/* 원본(`originalCategories`)을 넘긴다 — 이 패널은 저장 안 한 배분 초안이 아니라 **서버에
          저장된 값**을 그대로 되돌려 보내야 한다(PUT 은 부분 갱신이 아니다). 설정 버튼이
          시나리오 편집 중엔 잠겨 있어 둘이 겹칠 일은 없지만, 소스를 명시해 둔다.
          `key` — 저장 후 새 목록이 오면 패널 안 draft 를 새 원본으로 다시 세운다.
          실패해 다시 열릴 때는 `initialDraft` 가 그 재설정을 덮어 사용자의 토글을 되살린다. */}
      <DisclosurePanel id={ACTIVATION_PANEL_ID} open={isManagingActivation && !saving} focusOnOpen={false} divider={false}>
        <CategoryActivationPanel
          key={originalCategories.map((c) => `${c.category_code}:${String(c.is_active)}`).join()}
          rows={originalCategories}
          onSave={handleSave}
          onCancel={() => {
            reset();
            onManagingActivationChange(false);
          }}
          error={error}
          initialDraft={failedDraft}
        />
      </DisclosurePanel>

      {/* D14 L3 의 **문구 계층**(해요체 2줄 — 무엇을 / 왜 걸리는지)은 지키되 표현은 오버레이가
          아니다(D21) — 오버레이는 "무엇이 남는지"를 가려 이 화면의 목적과 정면으로 충돌한다.
          `StatusCallout` 은 숨어도 부모의 flex 아이템으로 남으므로 gap 있는 컨테이너에 직접
          두지 않는다. 여기 부모(Card 본문)는 gap 이 없고, 위 여백은 그 컴포넌트의 mt-4 가 낸다. */}
      <StatusCallout shown={saving}>
        <p className="text-sm font-bold text-ink">AI가 체크리스트와 타임라인을 다시 만들고 있어요.</p>
        <p className="text-xs text-ink-soft">손댄 항목은 그대로 남아요. 1분 정도 걸릴 수 있어요.</p>
      </StatusCallout>

      {/* 46초를 기다린 끝이 무표시로 끝나지 않게 — 화면에서는 자리표시가 실제 행으로 바뀌는 것이
          신호지만, 그 변화는 낭독되지 않는다(자리표시가 접근성 트리 밖이라). TimelinePage 의
          같은 패턴. 실패는 패널 안 `role="alert"` 가 따로 낸다. */}
      <output className="sr-only">{announcement}</output>
    </Card>
  );
}
