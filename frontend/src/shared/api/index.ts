// shared/api 공개 표면.
export { checkApiBase, isLocalOnlyApiBase } from "./api-base";
export { apiFetch, apiFetchMultipart, notifyUnauthorized, onUnauthorized, PERSONALIZATION_TIMEOUT_MS } from "./client";
export { reportClientError, type ClientErrorReport } from "./client-error-report";
export { apiBase } from "./env";
export { ApiError, isApiError, parseApiError } from "./errors";
export {
  CATEGORY_CODES, CHAT_ROLES, CHAT_STAGES, CHECKLIST_STATUS_BY_CATEGORY,
  REGION_CODES, SOURCE_TIERS, VERDICTS,
  type CategoryCode, type ChatRole, type ChatStage, type RegionCode,
  type SourceTier, type Verdict,
} from "./contract";
