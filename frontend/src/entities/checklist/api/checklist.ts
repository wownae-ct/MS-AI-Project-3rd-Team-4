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
