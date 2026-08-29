// 체크리스트 도메인 타입 — 03_API_spec.md ② 섹션(#12-#14).
// status 유효값은 카테고리에 따라 갈린다(HOMEWARE 만 다른 상태기계) — API 스펙 §2-B, 화면이 분기한다.
import { CHECKLIST_STATUS_BY_CATEGORY, type CategoryCode } from "@/shared/api";

export type ChecklistItemType = "CONTRACT_TERM" | "EXTRA_COST" | "PREP";
// "CATALOG_FALLBACK"은 2026-08-28 신규 — 개인화 validate가 BLOCKED일 때의 결정론적
// 카탈로그 대체 항목(진짜 LLM 실시간 생성이 아님, backend origin='LLM' mislabel 수정).
export type ChecklistItemOrigin = "LLM" | "USER" | "CATALOG_FALLBACK";
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

/**
 * 수동 재생성(#32) 뒤에도 **남을** 항목인가. `entities/timeline` 의 `isTimelineItemKept` 와 같은
 * 목적·같은 한계다(서버의 `user_edited_at` 를 응답이 주지 않아 화면이 아는 흔적으로 근사한다).
 *
 * 체크리스트에서 사용자가 남기는 흔적은 **상태 변경**과 **메모** 둘이다. "상태를 바꿨다"는
 * 초기 상태와 다르다는 뜻이고, 그 초기 상태는 카테고리마다 갈린다(HOMEWARE 만 LISTED, 나머지는
 * TODO). 그 표는 `shared/api/contract.ts` 의 `CHECKLIST_STATUS_BY_CATEGORY` 가 이미 갖고 있으므로
 * **첫 값**을 초기 상태로 읽는다 — 여기서 목록을 다시 적으면 두 곳이 조용히 갈린다.
 *
 * ⚠️ 바꿨다가 되돌린 항목은 서버에선 보존되는데 여기선 초기화 쪽으로 센다 — 타임라인과 같은
 * 방향의 오차라(실제보다 덜 남는다고 말한다) 사용자가 예상보다 많이 잃는 일은 없다.
 */
export function isChecklistItemKept(item: ChecklistItem, categoryCode: string): boolean {
  if (item.memo !== null && item.memo !== "") return true;
  const initialStatus = CHECKLIST_STATUS_BY_CATEGORY[categoryCode as CategoryCode]?.[0];
  return initialStatus !== undefined && item.status !== initialStatus;
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

// 백엔드 ChecklistItemCreate 스키마(dev-35, 03_API_spec.md #14)가 강제하는 길이 상한과 값을
// 맞춘다 — 프론트에서 먼저 막아야 422 왕복 없이 사용자가 바로 알 수 있다(레드팀 감사 CROSS 항목).
export const CHECKLIST_TITLE_MAX_LENGTH = 200;
export const CHECKLIST_BODY_MAX_LENGTH = 2000;
