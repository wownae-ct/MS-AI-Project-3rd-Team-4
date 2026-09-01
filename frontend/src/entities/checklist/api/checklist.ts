// 체크리스트 항목(#23-25) REST 클라이언트 — 목록 조회 · 상태 변경 · 사용자 직접 추가.
//
// 상태값은 카테고리마다 다르다(혼수는 구매 단계, 나머지는 진행 단계). 그 규칙은 서버가
// 결정하므로 여기서는 서버가 준 값을 그대로 실어 나르기만 한다.
import { apiFetch } from "@/shared/api";
import type {
  ChecklistItem,
  ChecklistItemCreateInput,
  ChecklistItemPatchInput,
  ChecklistItemPatchResponse,
  ChecklistItemsResponse,
  ChecklistItemType,
} from "../model";

export function getChecklistItems(params?: {
  categoryCode?: string;
  itemType?: ChecklistItemType;
}): Promise<ChecklistItemsResponse> {
  const query = new URLSearchParams();
  if (params?.categoryCode) query.set("category_code", params.categoryCode);
  if (params?.itemType) query.set("item_type", params.itemType);
  const qs = query.toString();
  return apiFetch(`/api/v1/checklist-items${qs ? `?${qs}` : ""}`) as Promise<ChecklistItemsResponse>;
}

export function patchChecklistItem(
  itemId: string,
  input: ChecklistItemPatchInput,
): Promise<ChecklistItemPatchResponse> {
  return apiFetch(`/api/v1/checklist-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }) as Promise<ChecklistItemPatchResponse>;
}

export function createChecklistItem(input: ChecklistItemCreateInput): Promise<ChecklistItem> {
  return apiFetch("/api/v1/checklist-items", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<ChecklistItem>;
}
