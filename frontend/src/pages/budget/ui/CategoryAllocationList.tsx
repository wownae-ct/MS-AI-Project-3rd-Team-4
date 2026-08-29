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
import type { BenchmarkComparison } from "@/entities/payment";
import type { WeddingCategory } from "@/entities/wedding";
import { Card, DisclosurePanel, IconSettings } from "@/shared/ui";
import { CategoryActivationPanel } from "./CategoryActivationPanel";
import { CategoryAllocationRow } from "./CategoryAllocationRow";

// 아이콘 단독 버튼 — 보이는 라벨이 없어 아이콘 자체(20px)가 타겟 크기의 전부가 될 뻔했다.
// `min-h-tap`/`min-w-tap`(44px)으로 상자를 키운다(`entities/chat/ui/MessageBubble.tsx` 의 아이콘
// 단독 버튼과 같은 짝). 색 전환은 duration-150 — 크기 전환(200)과 구분하는 이 저장소 관례.
const SETTINGS_BUTTON =
  "min-h-tap inline-flex min-w-tap items-center justify-center rounded-md text-ink-soft " +
  "transition-colors duration-150 enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";

const AMOUNTS_PANEL_ID = "budget-category-amounts";
const ACTIVATION_PANEL_ID = "budget-category-activation";

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
  /** 사용 여부 저장 성공 — 서버가 돌려준 최신 9개. */
  onCategoriesSaved: (categories: WeddingCategory[]) => void;
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
  const activeRows = rows.filter((category) => category.is_active);

  // 한 카드에 편집 모드 둘이 동시에 열리면 초안이 어느 쪽 것인지 알 수 없고, 전환하는 순간
  // 배분 초안이 조용히 버려진다. 반대 방향(사용 여부 편집 중 "예산 조정하기" 막기)은 BudgetPage 가 건다.
  const settingsButton = (
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
          되돌리기에 자연스럽다. */}
      <DisclosurePanel id={AMOUNTS_PANEL_ID} open={!isManagingActivation} focusOnOpen={false} divider={false}>
        <div>
          {activeRows.map((category) => {
            const hasCost = hasCostByCode.get(category.category_code) ?? true;
            const original = originalCategories.find((c) => c.category_code === category.category_code);
            const originalAmount = original?.planned_budget ?? category.planned_budget;
            return (
              <CategoryAllocationRow
                key={category.category_code}
                category={category}
                hasCost={hasCost}
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
          `key` — 저장 후 새 목록이 오면 패널 안 draft 를 새 원본으로 다시 세운다. */}
      <DisclosurePanel id={ACTIVATION_PANEL_ID} open={isManagingActivation} focusOnOpen={false} divider={false}>
        <CategoryActivationPanel
          key={originalCategories.map((c) => `${c.category_code}:${String(c.is_active)}`).join()}
          rows={originalCategories}
          onSaved={onCategoriesSaved}
          onCancel={() => onManagingActivationChange(false)}
        />
      </DisclosurePanel>
    </Card>
  );
}
