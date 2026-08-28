// AI상담 도메인 타입 — 03_API_spec.md ⑥ 섹션(#27-#29).

export type ChatRole = "user" | "assistant";
// backend/app/schemas/common.py:56 이 원본이다 — 이전엔 여기가 "UNSUPPORTED"로 잘못 옮겨져
// 있었다(실제 값은 "WEAK"). 실행 중엔 MessageBubble의 3항 연산자 마지막 분기가 우연히 커버해서
// 겉으로는 안 드러났지만, 타입 자체가 틀려 있었다(다른 세션의 목업 재대조 감사로 발견, 2026-08-24).
export type VerificationVerdict = "SUPPORTED" | "WEAK" | "GENERAL";

// 챗 그래프(backend/app/rag/graph.py) 노드 이름과 1:1 — SSE stage 이벤트 payload
// (backend/app/schemas/common.py의 ChatStage) 그대로. 진행상황 표시용 UX 신호일 뿐 최종
// 응답(citations/verification)엔 영향 없다.
export type ChatStage = "retrieve" | "generate" | "verify";

// AI 답변 좋아요/싫어요 평가 — backend/app/schemas/chat.py의 RatingIn/ChatMessageOut.user_rating
// 원본 그대로(2026-08-24 백엔드 세션 인계, feature/backend-chat-tracing-quality, 아직 push 전).
export type MessageRating = "GOOD" | "BAD";

export interface ChatSession {
  id: string;
  // null 가능 — 하단 탭 "AI상담"(카테고리 무관 전역 상담, pages/chat/ui/ChatPage.tsx)이
  // category_code 없이 만든 세션은 null로 응답된다(backend PR #50, 2026-08-24 머지).
  category_code: string | null;
  title: string | null;
  created_at: string;
}

export interface ChatCitation {
  chunk_id: number;
  title: string;
  source_tier: "OFFICIAL" | "CONSENSUS" | "INDUSTRY";
  // 팀 자체 저작 콘텐츠(DS6_CHECK 등)는 원문 URL이 없다 — nullable(backend/app/schemas/chat.py:30).
  source_url: string | null;
}

export interface ChatVerification {
  verdict: VerificationVerdict;
  reason: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  citations?: ChatCitation[];
  verification?: ChatVerification;
  // AI 답변에만 값이 온다(user 메시지는 항상 null) — 재평가 시 마지막 값으로 덮어쓴다.
  user_rating?: MessageRating | null;
  created_at: string;
  // 클라이언트 전용 필드 — 서버는 절대 이 값을 보내지 않는다. 낙관적으로 붙인 user 메시지의
  // 전송이 실패했을 때만 true 로 세팅해, 성공한 메시지와 시각적으로 구분한다(레드팀 감사:
  // 이전엔 실패해도 말풍선이 성공과 똑같이 보였다).
  failed?: boolean;
}

export interface ChatMessagesResponse {
  messages: ChatMessage[];
}
