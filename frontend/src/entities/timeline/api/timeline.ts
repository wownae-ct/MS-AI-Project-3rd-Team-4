import { apiFetch } from "@/shared/api";
import type { TimelineItem, TimelineItemCreateInput, TimelineItemPatchInput, TimelineItemsResponse } from "../model";

export function getTimelineItems(categoryCode?: string): Promise<TimelineItemsResponse> {
  const qs = categoryCode ? `?category_code=${encodeURIComponent(categoryCode)}` : "";
  return apiFetch(`/api/v1/timeline-items${qs}`) as Promise<TimelineItemsResponse>;
}

export function patchTimelineItem(itemId: string, input: TimelineItemPatchInput): Promise<TimelineItem> {
  return apiFetch(`/api/v1/timeline-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }) as Promise<TimelineItem>;
}

export function createTimelineItem(input: TimelineItemCreateInput): Promise<TimelineItem> {
  return apiFetch("/api/v1/timeline-items", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<TimelineItem>;
}
