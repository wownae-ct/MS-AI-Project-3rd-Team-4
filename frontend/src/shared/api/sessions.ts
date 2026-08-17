// backend/app/gateway/routers/sessions.py 대응
import { http } from "./client";

export function createSession() {
  return http.post<unknown>("/api/v1/sessions");
}

export function getSession(sessionId: string) {
  return http.get<unknown>(`/api/v1/sessions/${sessionId}`);
}

export function endSession(sessionId: string) {
  return http.post<unknown>(`/api/v1/sessions/${sessionId}/end`);
}

export function getSessionPlan(sessionId: string) {
  return http.get<unknown>(`/api/v1/sessions/${sessionId}/plan`);
}

export function getSessionTraces(sessionId: string) {
  return http.get<unknown>(`/api/v1/sessions/${sessionId}/traces`);
}

// WS 연결이 끊겼을 때의 REST 폴백 (백엔드 주석과 동일)
export function reportPain(sessionId: string, body: unknown) {
  return http.post<unknown>(`/api/v1/sessions/${sessionId}/pain-report`, body);
}
