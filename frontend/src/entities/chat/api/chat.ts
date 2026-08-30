import { apiBase, apiFetch, notifyUnauthorized } from "@/shared/api";
import { parseApiError } from "@/shared/api/errors";
import type {
  ChatCitation,
  ChatMessagesResponse,
  ChatSession,
  ChatSessionListResponse,
  ChatStage,
  ChatVerification,
  MessageRating,
} from "../model";

// categoryCode 생략 시 카테고리 무관 전역 상담 세션이 된다(backend PR #50, 2026-08-24 머지 —
// POST /chat/sessions의 category_code가 optional로 열렸고 RAG 검색도 필터 없이 전체 대상으로
// 동작한다). 하단 탭 "AI상담"(pages/chat)이 이 경로를 쓰고, S3 카테고리 상세는 여전히 고정값을 준다.
export function createChatSession(categoryCode?: string): Promise<ChatSession> {
  return apiFetch("/api/v1/chat/sessions", {
    method: "POST",
    body: JSON.stringify({ category_code: categoryCode ?? null }),
  }) as Promise<ChatSession>;
}

// 지난 대화 목록(backend PR #131, 2026-08-29 머지) — 이 웨딩의 세션 전체를 최근 대화 순으로
// 준다(백엔드가 `last_message_at desc nulls_last, created_at desc`로 정렬해서 보내므로
// 프론트에서 다시 정렬하지 않는다 — 두 곳에 정렬 규칙을 두면 조용히 갈린다).
//
// 이름변경 엔드포인트는 아직 없다 — 목록의 제목은 백엔드가 첫 질문에서 유도한 값이다.
export function listChatSessions(): Promise<ChatSessionListResponse> {
  return apiFetch("/api/v1/chat/sessions") as Promise<ChatSessionListResponse>;
}

/**
 * 지난 대화 1건 삭제 (사용자 요청 2026-08-30).
 *
 * 백엔드가 요청한 계약 그대로 구현했다(회신 2026-08-30) — 성공 204 · 실패는 **봉투 형식의**
 * 404 `CHAT_SESSION_NOT_FOUND`(없음 · 남의 것 · 이미 지워짐 전부). 메시지는 DB 의
 * `ondelete="CASCADE"` 가 함께 지운다. 계약 전문과 판단 근거는
 * `docs/backend-analysis/BACKEND_REQUEST-2026-08-30-chat-session-delete.md`.
 *
 * 🚨 **배포는 백엔드가 먼저다.** 그쪽이 나가기 전에 이 함수를 부르면 FastAPI 기본
 * 404(`{"detail":"Not Found"}`)가 오는데, 그 바디엔 `error` 봉투가 없어
 * `parseApiError`(shared/api/errors.ts)가 `UNKNOWN_ERROR` 로 떨어뜨린다 — 화면엔 「서버 응답을
 * 해석할 수 없습니다 (HTTP 404).」가 뜬다. **조용히 성공한 척하지 않는다**는 뜻이라 안전한
 * 실패이긴 하지만 사용자에게 보여 줄 문구는 아니다(드로어의 `CHAT_SESSION_NOT_FOUND` 흡수가
 * **봉투 안의 코드로만** 걸리게 돼 있는 이유가 이것이다 — 미배포 404 를 삭제 성공으로 오인하지 않는다).
 *
 * 성공은 204(바디 없음)라 반환값이 `void` 다 — `entities/payment/api/payment.ts` 의
 * `deletePayment` 와 같은 모양이고, `client.ts::readBody` 가 204 를 `undefined` 로 처리한다.
 */
export function deleteChatSession(sessionId: string): Promise<void> {
  return apiFetch(`/api/v1/chat/sessions/${sessionId}`, { method: "DELETE" }) as Promise<void>;
}

export function getChatMessages(sessionId: string): Promise<ChatMessagesResponse> {
  return apiFetch(`/api/v1/chat/sessions/${sessionId}/messages`) as Promise<ChatMessagesResponse>;
}

// AI 답변(assistant 메시지)에만 가능 — user 메시지에 시도하면 백엔드가 400
// CHAT_MESSAGE_NOT_RATABLE을 준다. 재호출하면 마지막 값으로 덮어쓴다(재평가).
export function rateChatMessage(
  sessionId: string,
  messageId: string,
  rating: MessageRating,
): Promise<{ message_id: string; rating: MessageRating }> {
  return apiFetch(`/api/v1/chat/sessions/${sessionId}/messages/${messageId}/feedback`, {
    method: "POST",
    body: JSON.stringify({ rating }),
  }) as Promise<{ message_id: string; rating: MessageRating }>;
}

export interface SendMessageHandlers {
  onToken: (delta: string) => void;
  onCitations: (citations: ChatCitation[]) => void;
  onVerification: (verification: ChatVerification) => void;
  // 챗 그래프 노드(retrieve→generate→verify) 진입 신호 — 옵셔널이라 안 넘겨도 기존 동작 그대로.
  onStage?: (stage: ChatStage) => void;
  // CRAG 조건부 재검색 루프 진입 신호(verify가 WEAK/GENERAL일 때 최대 1회) — 이 시점까지 쌓인
  // 1차 답변 토큰은 버려야 한다. reason은 1차 판정이 WEAK/GENERAL이 된 사유 문장.
  onRetry?: (reason: string) => void;
  onDone: (payload: { message_id: string; latency_ms: number }) => void;
  onError: (payload: { code: string; message: string }) => void;
}

// SSE 이벤트 7종(03_API_spec.md §6-2 5종 + stage + retry) — 채팅 스트림 전용, 다른 엔드포인트엔
// 없다. stage는 챗 그래프(backend/app/rag/graph.py) 3개 노드(retrieve→generate→verify) 진입
// 신호. retry는 CRAG 조건부 재검색 루프 진입 직전 신호 — 이게 오면 그때까지 스트리밍된 1차
// 답변 토큰은 전부 버리고 2차 답변을 처음부터 새로 받는다. 둘 다 순수 UX용 신호라 무시해도
// 기존 5종만으로 완전히 동작한다(additive).
function dispatchSseFrame(frame: string, handlers: SendMessageHandlers): void {
  const lines = frame.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLine = lines.find((line) => line.startsWith("data:"));
  if (!eventLine || !dataLine) return;

  const eventType = eventLine.slice("event:".length).trim();
  const data: unknown = JSON.parse(dataLine.slice("data:".length).trim());

  switch (eventType) {
    case "token":
      handlers.onToken((data as { delta: string }).delta);
      break;
    case "citations":
      handlers.onCitations((data as { citations: ChatCitation[] }).citations);
      break;
    case "verification":
      handlers.onVerification(data as ChatVerification);
      break;
    case "stage":
      handlers.onStage?.((data as { stage: ChatStage }).stage);
      break;
    case "retry":
      handlers.onRetry?.((data as { reason: string }).reason);
      break;
    case "done":
      handlers.onDone(data as { message_id: string; latency_ms: number });
      break;
    case "error":
      handlers.onError(data as { code: string; message: string });
      break;
    default:
      break;
  }
}

// POST 요청이라 EventSource 를 못 쓴다(커스텀 바디 전송 불가, API 스펙 §6-2 "구현 노트") —
// fetch + ReadableStream 으로 SSE 프레임을 직접 파싱한다. apiFetch 를 태우지 않는 이유는
// apiFetchMultipart 와 같다 — 응답이 JSON 한 덩어리가 아니라 스트림이라 body 를 직접 읽어야 한다.
//
// `signal` 은 옵셔널이다 — 호출자(ChatPanel)가 컴포넌트 언마운트 시 이 스트림을 스스로 끊을 수
// 있게 열어둔 자리다(레드팀 감사: 탭 이동으로 언마운트돼도 스트림이 abort 없이 계속 실행되던
// 문제). 호출자가 abort 하면 이건 진짜 에러가 아니라 "더 이상 안 봐도 된다"는 뜻이라 onError 를
// 부르지 않고 조용히 끝낸다 — 언마운트된 컴포넌트에 에러 상태를 던져봐야 아무도 안 본다.
export async function sendChatMessage(
  sessionId: string,
  content: string,
  handlers: SendMessageHandlers,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal,
    });

    if (!res.ok || !res.body) {
      const body: unknown = await res.json().catch(() => null);
      const error = parseApiError(res.status, body);
      // 이 엔드포인트는 apiFetch 를 안 태우므로(스트림 응답이라 위 머리말 참고), 공용
      // 401 무효화 경로도 스스로 태워야 한다 — 안 그러면 채팅에서만 세션 만료가 조용히
      // 일반 에러로 표시되고 앱 나머지는 세션이 여전히 유효하다고 믿는다(레드팀 감사).
      notifyUnauthorized(error);
      handlers.onError({ code: error.code, message: error.message });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    let streamDone = false;
    while (!streamDone) {
      // 스트림 청크는 순서가 있고 이전 read() 결과(버퍼)에 의존한다 — Promise.all 로 병렬화 불가.
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      streamDone = done;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        dispatchSseFrame(frame, handlers);
      }
    }
  } catch (err) {
    if (signal?.aborted) return;
    throw err;
  }
}
