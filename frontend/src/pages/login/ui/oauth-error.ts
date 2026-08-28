// OAuth 콜백 실패는 JSON 이 아니라 `{프론트}/login?oauth_error=<코드>` 로 온다.
// ⚠️ 백엔드가 소문자 snake(앞 6개)와 SCREAMING(뒤 4개)을 섞어 보낸다 — 정규화하지 않고
//    원문 그대로 키로 쓴다. 대소문자를 맞추려다 매칭을 놓치는 편이 더 나쁘다.
const MESSAGES: Record<string, string> = {
  unsupported_provider: "지원하지 않는 로그인 방식입니다.",
  denied: "로그인이 취소되었습니다.",
  state_missing: "로그인 요청이 만료되었습니다. 다시 시도해 주세요.",
  state_invalid: "로그인 요청이 손상되었습니다. 다시 시도해 주세요.",
  state_mismatch: "보안 확인에 실패했습니다. 다시 시도해 주세요.",
  upstream_failed: "로그인 제공자와 통신하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  EMAIL_ALREADY_EXISTS: "이미 가입된 이메일입니다. 이메일 로그인을 이용해 주세요.",
  SOCIAL_ACCOUNT_ALREADY_LINKED: "다른 방식으로 가입된 계정입니다.",
  UPSTREAM_LLM_ERROR: "로그인 제공자 응답에 문제가 있었습니다. 다시 시도해 주세요.",
  UNKNOWN_ERROR: "로그인에 실패했습니다. 다시 시도해 주세요.",
};

/** 모르는 코드도 빈 문자열을 주지 않는다 — 조용히 사라지면 사용자는 무슨 일이 났는지 모른다. */
export function oauthErrorMessage(code: string): string {
  return MESSAGES[code] ?? "로그인에 실패했습니다. 다시 시도해 주세요.";
}
