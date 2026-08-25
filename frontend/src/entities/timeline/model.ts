// 타임라인 도메인 타입 — 03_API_spec.md ③ 섹션(#15-#17).
// phase_label 은 v4.0에서 저장 컬럼이 아니다(CLAUDE.md "Personalization" 절) — 화면이
// default_dday_offset_days 대신 target_date/D-day 로 구간을 계산해야 하지만, 이 응답엔
// 그 원본 offset 이 없으므로 여기서는 target_date/d_day 기반 표시만 지원한다.

export type TimelineItemOrigin = "LLM" | "USER";
export type TimelineItemStatus = "TODO" | "DONE";

export interface TimelineItem {
  id: string;
  /** null 가능 — 혼인신고·본식처럼 특정 카테고리에 속하지 않는 항목이 실제로 있다
      (backend/app/schemas/timeline.py:17, 12_final_prototype_mockup.html의 t4/t12).
      이전엔 여기가 `string`으로 잘못 좁혀져 있어 그런 항목의 렌더링이 검증되지 않았다. */
  category_code: string | null;
  origin: TimelineItemOrigin;
  title: string;
  target_date: string;
  status: TimelineItemStatus;
  date_overridden: boolean;
  is_overdue: boolean;
}

export interface TimelineItemsResponse {
  items: TimelineItem[];
}

export interface TimelineItemPatchInput {
  target_date?: string;
  status?: TimelineItemStatus;
}

export interface TimelineItemCreateInput {
  category_code?: string | null;
  title: string;
  target_date: string;
}
