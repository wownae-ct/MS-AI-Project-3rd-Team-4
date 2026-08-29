// 「카테고리 사용 여부」 초안의 **저장 규칙** — 순수 함수만 모은다(React 없음).
//
// 원래 `CategoryActivationPanel` 안에 렌더와 섞여 있었는데, 저장이 끝날 때까지 패널이 열려 있는
// 구조에서는 그래도 됐다. 2026-08-29 개편으로 **확인 즉시 패널이 접히고**(진행 표시가 목록 쪽으로
// 옮겨 갔다) PUT 은 그보다 오래 사는 주체가 소유해야 해서(`use-activation-save.ts`), 규칙만 여기로
// 들어냈다. **동작은 한 줄도 바뀌지 않았다** — 이 파일의 테스트가 그 이관을 고정한다.
import type { WeddingCategory, WeddingCategoryUpdateInput } from "@/entities/wedding";

/** code → 활성 여부. 배열 사본 대신 이 맵만 두는 이유는 이 편집이 `is_active` 하나만 만지기
 *  때문이다 — 나머지 필드는 저장할 때 원본 행에서 그대로 읽어 되돌려 보낸다. */
export type ActivationDraft = Readonly<Record<string, boolean>>;

/** 초안에 없는 코드는 원본 값이 답이다(토글을 안 건드린 행). */
export function isActiveInDraft(row: WeddingCategory, draft: ActivationDraft): boolean {
  return draft[row.category_code] ?? row.is_active;
}

/**
 * 끄는 카테고리의 저장할 예산.
 *
 * 서버의 초과 검증은 `is_active` 무관 9개 전체 합이라(`backend/app/services/wedding.py`) 끄면서
 * 금액을 남기면 "화면엔 그 행이 없는데 초과" 상태가 만들어진다 — 그래서 0 으로 민다.
 * **단, 이미 지불한 금액이 있으면 못 민다** — `planned_budget < paid_amount` 는 400
 * BUDGET_BELOW_PAID 다. 그 경우엔 원래 값을 그대로 둔다.
 */
export function plannedBudgetForInactive(category: WeddingCategory): number {
  return category.paid_amount > 0 ? category.planned_budget : 0;
}

/** 활성 집합이 실제로 바뀌었는가 — 그대로면 저장할 것이 없다(46초 재생성을 헛돌게 하지 않는다). */
export function hasActivationChanges(rows: readonly WeddingCategory[], draft: ActivationDraft): boolean {
  return rows.some((row) => isActiveInDraft(row, draft) !== row.is_active);
}

export interface ActivationChanges {
  /** 꺼져 있다가 켜지는 코드 — 이 자리에 자리표시가 선다(결과를 서버만 안다). */
  activated: string[];
  /** 켜져 있다가 꺼지는 코드 — 결과를 프론트가 정확히 계산할 수 있어 즉시 반영한다. */
  deactivated: string[];
}

export function splitActivationChanges(rows: readonly WeddingCategory[], draft: ActivationDraft): ActivationChanges {
  const activated: string[] = [];
  const deactivated: string[] = [];
  rows.forEach((row) => {
    const next = isActiveInDraft(row, draft);
    if (next === row.is_active) return;
    if (next) activated.push(row.category_code);
    else deactivated.push(row.category_code);
  });
  return { activated, deactivated };
}

/**
 * `PUT /wedding-categories` 페이로드. **부분 갱신이 아니다** — 9개 전체를 보내되 이 편집이
 * 만지지 않는 필드(`selected_options`/`display_order`)는 조회값 그대로 되돌려 보낸다.
 * 지우면 온보딩에서 고른 하위 옵션이 조용히 사라진다.
 */
export function buildActivationPayload(
  rows: readonly WeddingCategory[],
  draft: ActivationDraft,
): WeddingCategoryUpdateInput[] {
  return rows.map((row) => {
    const isActive = isActiveInDraft(row, draft);
    return {
      category_code: row.category_code,
      is_active: isActive,
      planned_budget: isActive ? row.planned_budget : plannedBudgetForInactive(row),
      selected_options: row.selected_options,
      display_order: row.display_order,
    };
  });
}

/**
 * **끄는 쪽만** 서버 응답을 기다리지 않고 먼저 반영한 행 목록.
 *
 * 서버가 돌려줄 값과 바이트 단위로 같아야 응답이 도착할 때 숫자가 튀지 않는다 —
 * `_wedding_category_out`(`backend/app/services/wedding.py`)이 `remaining` 을
 * `planned_budget - paid_amount` 로 다시 계산하므로 여기서도 같이 계산한다.
 * `paid_amount`/`scheduled_amount` 는 이 PUT 이 건드리지 않는 값이라 그대로 둔다.
 *
 * **켜는 쪽은 손대지 않는다.** 켜면 서버가 체크리스트·타임라인을 새로 만들고, 그 결과를 프론트가
 * 지어낼 수 없다 — 그 자리는 자리표시가 대신한다.
 */
export function applyDeactivations(
  rows: readonly WeddingCategory[],
  deactivated: readonly string[],
): WeddingCategory[] {
  const codes = new Set(deactivated);
  return rows.map((row) => {
    if (!codes.has(row.category_code)) return row;
    const plannedBudget = plannedBudgetForInactive(row);
    return { ...row, is_active: false, planned_budget: plannedBudget, remaining: plannedBudget - row.paid_amount };
  });
}
