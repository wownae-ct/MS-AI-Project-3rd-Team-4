import { apiFetch, PERSONALIZATION_TIMEOUT_MS } from "@/shared/api";
import type { PersonalizationDomain, PersonalizationRegenerateResult } from "../model";

// createWedding 등과 같은 개인화 라우터 에이전트를 동기로 기다린다 — 같은 이유로 같은 타임아웃을 쓴다
// (shared/api/client.ts 의 PERSONALIZATION_TIMEOUT_MS 주석 참고).
export function regeneratePersonalization(domains: PersonalizationDomain[]): Promise<PersonalizationRegenerateResult> {
  return apiFetch(
    "/api/v1/personalization/regenerate",
    { method: "POST", body: JSON.stringify({ domains }) },
    PERSONALIZATION_TIMEOUT_MS,
  ) as Promise<PersonalizationRegenerateResult>;
}
