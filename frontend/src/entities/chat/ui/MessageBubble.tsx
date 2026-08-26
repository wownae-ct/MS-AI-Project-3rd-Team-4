// ChatPanel.tsx에서 분리(2026-08-24, eslint max-lines 300줄 제한) — 좋아요/싫어요 평가 버튼
// 추가로 ChatPanel.tsx가 300줄을 넘겨서, 재사용 가능한 프레젠테이션 조각인 이 컴포넌트를
// 별도 파일로 뺐다. entities/chat/ui/ 소속 유지(ChatPanel과 같은 슬라이스).
import { useState, type ReactNode } from "react";
import { Badge } from "@/shared/ui";
import { safeExternalUrl } from "@/shared/lib/safe-url";
import { SOURCE_TIER_LABEL } from "@/shared/lib/source-tier";
import type { ChatMessage, MessageRating } from "../model";

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
  // 인용 배지는 여러 개가 동시에 펼쳐질 수 있다 — chunk_id는 세션 내에서 안정적인 서버 발급 id라
  // key로도, 펼침 상태 추적에도 그대로 쓴다.
  const [expandedCitations, setExpandedCitations] = useState<Set<number>>(new Set());
  function toggleCitation(chunkId: number) {
    setExpandedCitations((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) next.delete(chunkId);
      else next.add(chunkId);
      return next;
    });
  }
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
        // max-w-[85%]로 말풍선과 같은 폭 제한을 주고 flex-wrap을 켠다 — 출처가 여러 개거나
        // 제목이 길면 한 줄로 욱여넣던 예전 레이아웃이 카드 폭을 뚫고 나가 깨져 보였다
        // (사용자 리포트 2026-08-26 "화면이 깨져보여 · 박스가 커"). rounded-pill 배지는 원래
        // 한 줄짜리 짧은 라벨 전용이라 title이 줄바꿈되면 모양 자체가 일그러진다 — 그래서 개별
        // 배지도 truncate로 한 줄을 강제한다.
        <div className="flex max-w-[85%] flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge>
              {/* 문구는 목업 그대로다(s3-category-detail.html:355,361) — "출처"가 아니라 "근거", 체크마크 포함.
                  verdict 3종은 backend/app/schemas/common.py:56 원본 그대로("WEAK"가 실제 값 — 이전엔
                  "UNSUPPORTED"로 잘못 알고 있었다, entities/chat/model.ts 머리말 참조). */}
              {message.verification.verdict === "SUPPORTED"
                ? "✓ 근거 확인됨"
                : message.verification.verdict === "WEAK"
                  ? "근거 불충분"
                  : "일반 정보 · 근거 없음"}
            </Badge>
            {message.citations?.map((c) => {
              // source_tier는 백엔드 ENUM 원문(OFFICIAL/CONSENSUS/INDUSTRY)이라 그대로 보여주면
              // 사용자가 못 알아본다(사용자 리포트 2026-08-26) — SOURCE_TIER_LABEL로 옮기되, 모르는
              // 값이 와도 지어내지 않고 원문을 그대로 보여준다(PaymentRow.tsx와 같은 원칙).
              const tierLabel = SOURCE_TIER_LABEL[c.source_tier] ?? c.source_tier;
              const isExpanded = expandedCitations.has(c.chunk_id);
              return (
                <button
                  key={c.chunk_id}
                  type="button"
                  aria-expanded={isExpanded}
                  aria-label={`근거 자세히 보기: ${tierLabel} · ${c.title}`}
                  onClick={() => toggleCitation(c.chunk_id)}
                  className="min-h-tap max-w-[220px] rounded-pill border-none bg-transparent p-0 text-left enabled:hover:opacity-80"
                >
                  <Badge className="w-full truncate bg-bg text-ink-soft" title={`${tierLabel} · ${c.title}`}>
                    {/* 목업 형식(s3-category-detail.html:352-353): "{티어} · {제목}" — 티어만 보여주면
                        어떤 근거인지 사람이 알 수 없다. 전체 제목은 title 속성(hover 툴팁)뿐 아니라
                        클릭 시 아래 펼침 영역에도 남긴다 — 터치 기기는 hover가 없어 잘린 텍스트만으론
                        무슨 근거인지 못 알아본다(사용자 요청 2026-08-26). */}
                    {tierLabel} · {c.title}
                  </Badge>
                </button>
              );
            })}
          </div>
          {message.citations
            ?.filter((c) => expandedCitations.has(c.chunk_id))
            .map((c) => {
              const tierLabel = SOURCE_TIER_LABEL[c.source_tier] ?? c.source_tier;
              const safeUrl = c.source_url ? safeExternalUrl(c.source_url) : undefined;
              return (
                <div key={c.chunk_id} className="rounded-md border border-line bg-bg px-3 py-2 text-xs text-ink-soft">
                  <p className="font-bold text-ink">
                    {tierLabel} · {c.title}
                  </p>
                  {safeUrl ? (
                    <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-primary underline">
                      원문 보기
                    </a>
                  ) : (
                    // source_url이 null인 경우(entities/chat/model.ts 머리말) — 팀 자체 저작 콘텐츠라
                    // 원문 링크가 없는 게 정상이다. 링크 없이 조용히 비우면 "왜 안 눌려?" 로 보이니
                    // 이유를 문구로 남긴다.
                    <p className="mt-1">팀에서 직접 정리한 자료라 원문 링크는 없어요.</p>
                  )}
                </div>
              );
            })}
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
