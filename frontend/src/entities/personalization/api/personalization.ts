import { apiFetch } from "@/shared/api";
import type { PersonalizationDomain, PersonalizationRegenerateResult } from "../model";

export function regeneratePersonalization(domains: PersonalizationDomain[]): Promise<PersonalizationRegenerateResult> {
  return apiFetch("/api/v1/personalization/regenerate", {
    method: "POST",
    body: JSON.stringify({ domains }),
  }) as Promise<PersonalizationRegenerateResult>;
}
