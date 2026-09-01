// 타임라인 항목(#26-28) REST 클라이언트 — 목록 조회 · 완료 표시 · 사용자 직접 추가.
//
// 목표일은 본식일에서 역산해 서버가 계산한다. 사용자가 직접 고친 항목은 이후 본식일이
// 바뀌어도 다시 계산되지 않는다 — 그 판단도 서버 몫이라 여기서는 값을 옮기기만 한다.
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
