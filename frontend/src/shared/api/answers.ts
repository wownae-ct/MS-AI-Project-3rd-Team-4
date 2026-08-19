// backend/app/gateway/routers/answers.py 대응. submitAnswer는 multipart/form-data라
// http(client.ts, JSON 전용)를 쓰지 않고 fetch를 직접 호출한다.
import { ApiError, http } from "./client";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export async function submitAnswer(sessionId: string, questionId: string, audioFile: Blob) {
  const body = new FormData();
  body.append("question_id", questionId);
  body.append("audio_file", audioFile);
  const res = await fetch(`${API_BASE}/api/v1/sessions/${sessionId}/answers`, { method: "POST", body });
  if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => res.statusText));
  return (await res.json()) as unknown;
}

/** SSE 스트림 URL — EventSource는 컴포넌트 쪽에서 직접 열어야 하므로 URL만 제공 */
export function feedbackStreamUrl(answerId: string): string {
  return `${API_BASE}/api/v1/answers/${answerId}/feedback/stream`;
}

export function getAnswer(answerId: string) {
  return http.get<unknown>(`/api/v1/answers/${answerId}`);
}
