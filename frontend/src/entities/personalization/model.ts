// 수동 재생성(#32 MANUAL_REGENERATE) 도메인 타입 — 03_API_spec.md §9.
// backend/app/schemas/personalization.py 원본 그대로.

export type PersonalizationDomain = "CHECKLIST" | "TIMELINE";
export type PersonalizationRegenerateStatus = "SUCCESS" | "BLOCKED" | "FAILED";

export interface PersonalizationRegenerateResult {
  ai_invocation_id: string;
  status: PersonalizationRegenerateStatus;
  affected_domains: string[];
}
