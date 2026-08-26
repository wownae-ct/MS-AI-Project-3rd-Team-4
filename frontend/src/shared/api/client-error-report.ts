// 인증 불필요 · fire-and-forget 렌더 크래시 리포터(백엔드 POST /api/v1/client-errors, PR #78).
// apiFetch 를 안 태우는 이유는 sendChatMessage(chat.ts)와 같은 계열이지만 정반대 방향이다 —
// 그쪽은 스트림 응답이라 직접 읽어야 했고, 여기는 응답 자체가 없다(202, 바디 없음)와 인증이
// 아예 없는 엔드포인트라 apiFetch 의 credentials/401 처리 경로가 전부 무의미하다.
//
// ErrorBoundary.onError 안에서는 절대 던지면 안 된다("여기서 던지지 말 것 — 바운더리 자신이
// 깨진다", ErrorBoundary.tsx) — 그래서 실패를 전부 여기서 삼킨다. 리포팅 자체의 실패가 사용자
// 화면에 새 크래시를 더하면 원본 취지(크래시를 조용히 넘기지 않기)가 무색해진다.
import { apiBase } from "./env";

// 백엔드 스키마(app/schemas/client_error.py)의 max_length 와 맞춘다 — 넘기면 그냥 422 로
// 통째로 버려지므로, 잘라서라도 보내는 쪽이 아무것도 안 남는 것보다 낫다.
const MESSAGE_MAX_CHARS = 2000;
const STACK_MAX_CHARS = 8000;
const URL_MAX_CHARS = 2000;
const USER_AGENT_MAX_CHARS = 500;

export interface ClientErrorReport {
  message: string;
  stack: string | null;
  componentStack: string | null;
  url: string;
  userAgent: string | null;
}

function truncate(value: string | null, maxChars: number): string | null {
  if (value === null) return null;
  return value.length > maxChars ? value.slice(0, maxChars) : value;
}

export function reportClientError(report: ClientErrorReport): void {
  try {
    const payload = JSON.stringify({
      // message 는 서버가 min_length=1 을 요구한다 — 빈 문자열이면 통째로 422 로 버려지느니
      // 자리표시자를 채워서라도 크래시가 있었다는 사실 자체는 남긴다.
      message: truncate(report.message, MESSAGE_MAX_CHARS) || "(빈 에러 메시지)",
      stack: truncate(report.stack, STACK_MAX_CHARS),
      component_stack: truncate(report.componentStack, STACK_MAX_CHARS),
      url: truncate(report.url, URL_MAX_CHARS),
      user_agent: truncate(report.userAgent, USER_AGENT_MAX_CHARS),
    });
    const endpoint = `${apiBase()}/api/v1/client-errors`;

    // sendBeacon 을 우선한다 — 크래시 직후 사용자가 탭을 닫거나 새로고침해도(흔한 경로) 요청이
    // 살아남는다. 실패하거나 API 자체가 없으면(구형 환경) fetch+keepalive 로 폴백한다.
    const sentViaBeacon =
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
    if (sentViaBeacon) return;

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // 리포터의 실패는 리포터 안에서 끝난다 — 위 머리말 참고.
    });
  } catch {
    // apiBase() 가 설정 오류로 던질 수 있다(env.ts) — 그 경우도 포함해 이 함수는 절대 위로
    // 예외를 흘리지 않는다.
  }
}
