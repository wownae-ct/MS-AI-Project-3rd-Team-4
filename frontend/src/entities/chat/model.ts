// AI상담 도메인 타입 — 03_API_spec.md ⑥ 섹션(#27-#29).

export type ChatRole = "user" | "assistant";
// backend/app/schemas/common.py:56 이 원본이다 — 이전엔 여기가 "UNSUPPORTED"로 잘못 옮겨져
// 있었다(실제 값은 "WEAK"). 실행 중엔 MessageBubble의 3항 연산자 마지막 분기가 우연히 커버해서
// 겉으로는 안 드러났지만, 타입 자체가 틀려 있었다(다른 세션의 목업 재대조 감사로 발견, 2026-08-24).
// "OUT_OF_SCOPE"는 2026-08-29에 늘어난 4번째 값이다(backend PR #130) — 결혼 준비와 무관한 요청을
// 검색/생성 없이 거절한 경우. 종전엔 이것도 "GENERAL"을 재사용해서 배지가 「일반 정보 · 근거 없음」
// 으로 떴다 — "근거가 약해 일반론으로 답했다"와 "답하기를 거절했다"는 서로 다른 상황이라 분리했다.
export type VerificationVerdict = "SUPPORTED" | "WEAK" | "GENERAL" | "OUT_OF_SCOPE";

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

// `GET /chat/sessions`(목록) 전용 — 단건 `ChatSession`과 별도 타입인 이유는 백엔드가 그렇게
// 나눴기 때문이다(backend/app/schemas/chat.py::ChatSessionSummaryOut). 목록에만 필요한
// `last_message_at`을 더한 모양이고, 생성 응답(`ChatSessionOut`) 시점엔 아직 메시지가 없어
// 의미가 없는 값이라 거기엔 없다.
//
// ⚠️ `title`·`last_message_at`이 **둘 다 nullable**인 것은 실수가 아니다. 세션은 첫 메시지를
// 보내기 **직전**에 만들어지고(entities/chat/ui/ChatPanel.tsx의 handleSend), 백엔드는 그 첫
// 메시지가 실제로 저장되는 순간에야 title(첫 질문에서 유도)과 last_message_at을 채운다. 즉
// 전송이 실패하면 **둘 다 null인 빈 세션**이 서버에 실제로 남는다.
export interface ChatSessionSummary {
  id: string;
  category_code: string | null;
  title: string | null;
  last_message_at: string | null;
  created_at: string;
}

export interface ChatSessionListResponse {
  sessions: ChatSessionSummary[];
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
