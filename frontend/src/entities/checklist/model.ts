// 체크리스트 도메인 타입 — 03_API_spec.md ② 섹션(#12-#14).
// status 유효값은 카테고리에 따라 갈린다(HOMEWARE 만 다른 상태기계) — API 스펙 §2-B, 화면이 분기한다.

export type ChecklistItemType = "CONTRACT_TERM" | "EXTRA_COST" | "PREP";
export type ChecklistItemOrigin = "LLM" | "USER";
export type SourceTier = "OFFICIAL" | "CONSENSUS" | "INDUSTRY";
export type ChecklistPriority = "high" | "mid" | "low";

export type ChecklistStatusDefault = "TODO" | "DOING" | "SKIP" | "DONE";
export type ChecklistStatusHomeware = "LISTED" | "COMPARING" | "ORDERED" | "DELIVERED";
export type ChecklistStatus = ChecklistStatusDefault | ChecklistStatusHomeware;

export interface ChecklistItem {
  id: string;
  category_code: string;
  item_type: ChecklistItemType;
  option_group: string | null;
  origin: ChecklistItemOrigin;
  status: ChecklistStatus;
  group_label: string;
  title: string;
  body: string;
  priority: ChecklistPriority;
  // null 가능 — origin=USER(사용자 직접 추가) 항목이나 카탈로그 폴백 항목은 출처 신뢰도 등급이
  // 없다(backend/app/schemas/checklist.py:26). origin(LLM/USER, 필수)과는 독립된 필드다 — 목업은
  // 이 둘을 source 하나로 뭉갰지만(다른 세션의 재감사로 발견, 2026-08-24) 실제 계약은 분리돼 있다.
  source_tier: SourceTier | null;
  source_label: string;
  source_url: string | null;
  tag: string | null;
  memo: string | null;
}

export interface ChecklistItemsResponse {
  items: ChecklistItem[];
}

export interface ChecklistItemPatchInput {
  status?: ChecklistStatus;
  memo?: string;
}

/**
 * PATCH 응답은 전체 `ChecklistItem` 이 아니라 이 4필드뿐이다(api-contract.md §3.4).
 * 낙관적 갱신 시 이 응답으로 기존 `ChecklistItem` 을 덮어쓰면 나머지 필드(title·body·tag 등)가
 * 지워진다 — 호출부는 반드시 기존 항목에 이 4필드만 병합해야 한다.
 */
export interface ChecklistItemPatchResponse {
  id: string;
  status: ChecklistStatus;
  memo: string | null;
  updated_at: string;
}

export interface ChecklistItemCreateInput {
  category_code: string;
  item_type: ChecklistItemType;
  group_label: string;
  title: string;
  priority: ChecklistPriority;
  tag?: string;
}
