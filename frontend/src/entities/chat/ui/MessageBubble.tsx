// ChatPanel.tsx에서 분리(2026-08-24, eslint max-lines 300줄 제한) — 좋아요/싫어요 평가 버튼
// 추가로 ChatPanel.tsx가 300줄을 넘겨서, 재사용 가능한 프레젠테이션 조각인 이 컴포넌트를
// 별도 파일로 뺐다. entities/chat/ui/ 소속 유지(ChatPanel과 같은 슬라이스).
import type { ReactNode } from "react";
import { Badge, SourceList } from "@/shared/ui";
import type { ChatMessage, MessageRating } from "../model";

// verdict 4종은 backend/app/schemas/common.py:66 원본 그대로("WEAK"가 실제 값 — 이전엔
// "UNSUPPORTED"로 잘못 알고 있었다, entities/chat/model.ts 머리말 참조). 앞 3종의 문구는 목업
// 그대로다(s3-category-detail.html:355,361) — "출처"가 아니라 "근거", 체크마크 포함.
//
// "OUT_OF_SCOPE"는 목업에 없다(2026-08-29 신설, backend PR #130). 목업 톤을 따라 명사형·간결로
// 맞췄다 — Badge 는 whitespace-nowrap 계약이라 길수록 레이아웃이 불리하다.
//
// Record<string, string> 인 이유 — 타입에 없는 값이 와도 화면이 비지 않게 폴백을 남긴다
// (SOURCE_TIER_LABEL 과 같은 원칙). 종전에는 3항 연산자의 마지막 분기가 그 역할을 했다.
//
// ⚠️ 폴백이 GENERAL 과 같은 문구라, 여기서 항목을 빠뜨리면 **크래시 대신 조용한 오답**이 된다
// (OUT_OF_SCOPE 가 정확히 그 상태였다). 새 verdict 를 늘릴 땐 MessageBubble.test.tsx 의
// 「서로의 문구로 새지 않는다」 테스트도 같이 늘린다.
const VERDICT_LABEL: Record<string, string> = {
  SUPPORTED: "✓ 근거 확인됨",
  WEAK: "근거 불충분",
  GENERAL: "일반 정보 · 근거 없음",
  OUT_OF_SCOPE: "상담 범위 밖",
};
const VERDICT_FALLBACK = "일반 정보 · 근거 없음";

interface MessageBubbleProps {
  message: ChatMessage;
  // greeting/draft 호출부는 안 넘긴다 — 아직 서버가 발급한 진짜 message_id가 없어서 평가할
  // 대상이 없다(백엔드 규칙: user 메시지·존재하지 않는 메시지 평가는 400/404).
  onRate?: (messageId: string, rating: MessageRating) => void;
  // F13 신고 버튼은 entities/feedback 소속이라 같은 entities 레이어인 여기서 직접 import할 수
  // 없다(.oxlintrc.json no-restricted-imports — entities는 다른 entity를 못 가져온다). 그래서
  // 실제 버튼은 pages 레이어(CategoryPage/ChatPage)가 만들어 이 render prop으로 내려준다.
  renderReportAction?: (messageId: string) => ReactNode;
}

export function MessageBubble({ message, onRate, renderReportAction }: MessageBubbleProps) {
  const isUser = message.role === "user";
  return (
    <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-surface"
            : "max-w-[85%] whitespace-pre-wrap rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink"
        }
      >
        {message.content || "…"}
      </div>
      {/* 전송 실패한 낙관적 user 메시지 — 성공한 말풍선과 똑같이 보이면 사용자가 실패를 알 길이
          없다(레드팀 감사). 재시도 UI는 아직 없다 — 우선 실패를 숨기지 않는 것부터 고친다. */}
      {isUser && message.failed && (
        <p role="alert" className="text-xs text-primary">
          전송 실패 · 다시 시도해 주세요
        </p>
      )}
      {/* 근거 없이 답하지 않는다는 원칙을 시각적으로도 지킨다 — 출처 배지 또는 "근거 없음"을
          항상 표시한다(HANDOFF.md §4 S3). verification 이 아직 안 왔으면(스트리밍 중) 아무것도
          내지 않는다 — 이 시점엔 "근거 없음" 조차 확정된 사실이 아니다. */}
      {!isUser && message.verification && (
        // 말풍선과 같은 폭 제한(85%)을 준다.
        //
        // **[2026-08-29 개편 — D16]** 종전엔 검증 배지와 인용 배지 N개가 같은 flex 줄에
        // flex-wrap 으로 놓였다. 인용은 답변당 최대 5개라(RAG_CONTEXT_TOP_K=5) 데스크톱에서
        // max-w-[220px] 알약이 가로로 3~4개 늘어섰고(사용자 리포트 2026-08-29 "배지가 가로로 쭉
        // 나열된다"), 제목은 220px 안에서 항상 잘렸다("배지 내용이 잘린다"). 두 증상의 원인이
        // 하나였다 — 길이·개수가 가변인 것을 짧은 라벨용 그릇에 담은 것. 이제 검증 결과만 배지로
        // 남기고(짧고 고정된 어휘) 인용은 SourceList 가 세로 목록으로 받는다.
        <div className="max-w-[85%]">
          <SourceList
            leading={<Badge>{VERDICT_LABEL[message.verification.verdict] ?? VERDICT_FALLBACK}</Badge>}
            items={(message.citations ?? []).map((c) => ({
              key: c.chunk_id,
              tier: c.source_tier,
              title: c.title,
              url: c.source_url,
            }))}
          />
        </div>
      )}
      {/* 좋아요/싫어요 평가 — AI 답변에만(백엔드 규칙과 동일하게 verification이 있는 메시지만
          "완결된 AI 답변"으로 취급). 토글이 아니라 배타적 선택이라 aria-pressed로 현재 선택
          상태를 알린다. */}
      {!isUser && message.verification && onRate && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={message.user_rating === "GOOD"}
            aria-label="이 답변이 도움됐어요"
            onClick={() => onRate(message.id, "GOOD")}
            className={
              message.user_rating === "GOOD"
                ? "min-h-tap rounded-md border border-transparent bg-primary px-2 text-xs text-surface"
                : "min-h-tap rounded-md border border-line bg-bg px-2 text-xs text-ink-soft enabled:hover:text-ink"
            }
          >
            👍
          </button>
          <button
            type="button"
            aria-pressed={message.user_rating === "BAD"}
            aria-label="이 답변이 아쉬워요"
            onClick={() => onRate(message.id, "BAD")}
            className={
              message.user_rating === "BAD"
                ? "min-h-tap rounded-md border border-transparent bg-primary px-2 text-xs text-surface"
                : "min-h-tap rounded-md border border-line bg-bg px-2 text-xs text-ink-soft enabled:hover:text-ink"
            }
          >
            👎
          </button>
          {renderReportAction?.(message.id)}
        </div>
      )}
    </div>
  );
}
