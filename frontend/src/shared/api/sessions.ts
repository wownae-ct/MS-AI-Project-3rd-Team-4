// backend/app/gateway/routers/sessions.py 대응
import { http } from "./client";

export function createSession(userId: string) {
  return http.post<unknown>("/api/v1/sessions", { user_id: userId });
}

export function getSessionSummary(sessionId: string) {
  return http.get<unknown>(`/api/v1/sessions/${sessionId}/summary`);
}
