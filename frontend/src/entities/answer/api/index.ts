// answer 요청 함수. 응답 타입은 unknown 유지 — 백엔드 계약 확정 전에 지어내지 않는다.
import { API_BASE, ApiError, http } from "@/shared/api";

/**
 * 답변 오디오 업로드.
 *
 * 공용 http 래퍼를 쓰지 않고 fetch를 직접 호출하는 것은 의도된 설계다 —
 * FormData는 브라우저가 boundary를 포함한 Content-Type을 스스로 정해야 하는데,
 * JSON 전용 래퍼를 태우면 Content-Type이 덮여 서버가 파싱하지 못한다.
 */
export async function submitAnswer(sessionId: string, questionId: string, audioFile: Blob) {
  const body = new FormData();
  body.append("question_id", questionId);
  body.append("audio_file", audioFile);
  const res = await fetch(`${API_BASE}/api/v1/sessions/${sessionId}/answers`, { method: "POST", body });
  if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => res.statusText));
  return (await res.json()) as unknown;
}

/** SSE 스트림 URL — EventSource는 컴포넌트 쪽에서 직접 열어야 하므로 URL만 제공한다. */
export function feedbackStreamUrl(answerId: string): string {
  return `${API_BASE}/api/v1/answers/${answerId}/feedback/stream`;
}

export function getAnswer(answerId: string) {
  return http.get<unknown>(`/api/v1/answers/${answerId}`);
}
