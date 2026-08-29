// 타임라인 도메인 타입 — 03_API_spec.md ③ 섹션(#15-#17).
// phase_label 은 v4.0에서 저장 컬럼이 아니다(CLAUDE.md "Personalization" 절) — 화면이
// default_dday_offset_days 대신 target_date/D-day 로 구간을 계산해야 하지만, 이 응답엔
// 그 원본 offset 이 없으므로 여기서는 target_date/d_day 기반 표시만 지원한다.

// "CATALOG_FALLBACK"은 2026-08-28 신규 — checklist/model.ts와 동일 이유(backend origin='LLM'
// mislabel 수정).
export type TimelineItemOrigin = "LLM" | "USER" | "CATALOG_FALLBACK";
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

/**
 * 수동 재생성(#32) 뒤에도 **남을** 항목인가.
 *
 * 서버의 실제 보존 기준은 "사용자가 손댄 적 있는 행"(`user_edited_at IS NOT NULL`)이고 그 값은
 * 응답에 없다. 화면이 아는 것 중 그 기준과 1:1로 대응하는 것은 **완료 체크(status=DONE)** 와
 * **날짜 직접 변경(date_overridden)** 둘뿐이라 이 둘로 판정한다.
 *
 * 어긋나는 경우가 하나 있다 — 완료를 체크했다가 **해제**한 항목은 서버에선 보존되는데 여기선
 * 초기화 쪽으로 센다. 방향은 이쪽이 맞다: 실제보다 **덜 남는다고** 말하는 오차라, 사용자가
 * 예상보다 많이 잃는 일은 생기지 않는다(정확한 수를 알려면 응답에 보존 플래그가 필요하다 —
 * 백엔드 변경 사안이라 지금은 하지 않는다).
 *
 * 이 술어를 화면이 아니라 여기 두는 이유 — **재생성 확인 다이얼로그의 개수**와 **재생성 중
 * 스켈레톤의 자리**가 같은 기준을 써야 한다. 둘이 갈리면 "3개만 남아요"라고 예고해 놓고 5개를
 * 남긴 채 기다리는 화면이 된다.
 */
export function isTimelineItemKept(item: TimelineItem): boolean {
  return item.status === "DONE" || item.date_overridden;
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
