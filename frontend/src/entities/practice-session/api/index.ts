// practice_session 요청 함수. 응답 타입은 unknown 유지.
import { http } from "@/shared/api";

export function createSession(userId: string) {
  return http.post<unknown>("/api/v1/sessions", { user_id: userId });
}

export function getSessionSummary(sessionId: string) {
  return http.get<unknown>(`/api/v1/sessions/${sessionId}/summary`);
}
