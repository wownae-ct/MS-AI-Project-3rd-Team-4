// 개인화 재생성(#32) REST 클라이언트 — 사용자가 체크리스트/타임라인을 다시 만들어 달라고
// 명시적으로 요청할 때 쓴다. 어느 도메인을 다시 만들지는 호출부가 정해서 보낸다(에이전트
// 판단이 아니다).
//
// LLM 이 도는 동안 기다려야 해서 이 요청만 별도의 긴 제한 시간을 쓴다.
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
