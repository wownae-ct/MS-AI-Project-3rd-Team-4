// ChatPanel.tsx에서 분리(2026-08-24, eslint max-lines 300줄 제한) — 좋아요/싫어요 평가 버튼
// 추가로 ChatPanel.tsx가 300줄을 넘겨서, 재사용 가능한 프레젠테이션 조각인 이 컴포넌트를
// 별도 파일로 뺐다. entities/chat/ui/ 소속 유지(ChatPanel과 같은 슬라이스).
import type { ReactNode } from "react";
import { Badge, IconCheck, IconThumbDown, IconThumbUp, SourceList } from "@/shared/ui";
import type { ChatMessage, MessageRating } from "../model";

// verdict 4종은 backend/app/schemas/common.py:66 원본 그대로("WEAK"가 실제 값 — 이전엔
// "UNSUPPORTED"로 잘못 알고 있었다, entities/chat/model.ts 머리말 참조). 앞 3종의 문구는 목업
// 그대로다(s3-category-detail.html:355,361) — "출처"가 아니라 "근거".
//
// **[2026-08-29 D18]** 목업의 체크마크는 그대로 있다. 다만 SUPPORTED 라벨 문자열 안의 문자
// "✓"(U+2713)가 아니라 배지가 앞세우는 IconCheck 로 렌더한다 — 그 코드포인트는 Wanted Sans 의
// 어느 unicode-range 조각에도 없어 OS 폰트로 폴백했고 굵기·크기가 플랫폼마다 달랐다. **보이는
// 것은 같고 렌더 방식만 바뀌었다.**
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
  SUPPORTED: "근거 확인됨",
  WEAK: "근거 불충분",
  GENERAL: "일반 정보 · 근거 없음",
  OUT_OF_SCOPE: "상담 범위 밖",
};
const VERDICT_FALLBACK = "일반 정보 · 근거 없음";

// 평가 버튼 — **[2026-08-29 D18]** 종전엔 👍/👎 컬러 이모지였다. 세 가지가 동시에 깨져 있었다:
//   ① 선택 시 `bg-primary text-surface` 인데 컬러 이모지는 OS 비트맵 폰트라 currentColor 를
//      따르지 않는다 — 플럼 배경 위에 노란 엄지가 그대로 남았다.
//   ② 높이만 min-h-tap 이고 가로는 px-2 + 12px 글리프 = 약 28px 이라, docs/design/a11y.md §1 이
//      선언한 44px 터치 타겟 계약을 이 버튼 둘만 어기고 있었다(예외 근거 주석도 없었다).
//   ③ 이모지는 폰트 글리프라 D8 색 게이트(산출 CSS·소스)의 사각지대로 팔레트 밖 색이 들어왔고,
//      Wanted Sans 의 unicode-range 분할·self-host 전략도 우회했다(코드포인트가 어느 조각에도
//      없어 OS 폰트로 폴백 → 플랫폼마다 모양·폭·색이 달라진다).
//
// 클래스는 **완성 리터럴**로만 적는다 — Tailwind 는 소스를 평문 스캔한다(shared/ui/README 「코드
// 규약」). 아래처럼 완성된 두 조각을 템플릿으로 잇는 것은 안전하다(Badge.tsx 와 같은 방식).
const RATE_BASE =
  "inline-flex min-h-tap min-w-tap cursor-pointer items-center justify-center rounded-md border " +
  "transition-[background-color,border-color,color] duration-150";
// 선택됨 — 형태(선→채움)와 색 두 채널로 알린다. 색 하나로만 상태를 전달하지 않는다(WCAG 1.4.1).
// bg-primary 진한 채움을 쓰지 않는 이유는 The One Accent Rule — 답변 평가는 부가 액션인데
// 선택되는 순간 그 행에서 가장 강한 요소가 되어 버린다. 같은 조합의 선례가 이미 있다
// (entities/payment/ui/PaymentListRow.tsx 의 영수증 버튼).
const RATE_SELECTED = "border-primary bg-primary-soft text-primary";
// hover 는 전부 `enabled:` 뒤에 둔다 — shared/ui/Button.tsx 가 세운 규약.
const RATE_IDLE = "border-line bg-bg text-ink-soft enabled:hover:border-ink-soft enabled:hover:text-ink";

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
            leading={
              // 체크 아이콘은 SUPPORTED 에만 붙는다 — 다른 3종은 "확인됨"이 아니다. Badge BASE 가
              // 이미 inline-flex items-center 라 gap 만 얹으면 아이콘이 그대로 들어간다.
              <Badge className={message.verification.verdict === "SUPPORTED" ? "gap-1" : undefined}>
                {message.verification.verdict === "SUPPORTED" && <IconCheck size={12} />}
                {VERDICT_LABEL[message.verification.verdict] ?? VERDICT_FALLBACK}
              </Badge>
            }
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
        // flex-wrap — `renderReportAction` 이 「신고」를 누르면 인라인 폼 전체로 펼쳐져 이 행의
        // 형제 flex 아이템이 된다(entities/feedback/ui/ReportButton.tsx). 44px 버튼 둘과 나란히
        // 두면 좁은 폭에서 넘치므로 폼이 자기 줄을 쓰게 한다 — ChecklistItemRow 와 같은 처리다.
        <div className="flex flex-wrap items-center gap-1">
          {/* 아이콘은 장식이다(aria-hidden 기본값) — 접근명은 버튼의 aria-label 이 갖는다. 그래서
              IconProps 에 label 을 새로 열 필요가 없다(docs/design/inventory.md §7 이 예고한 prop).
              title 은 aria-label 과 **같은 문자열**로 준다: 마우스 사용자에게 이름을 노출하되
              두 값이 달라서 생기는 스크린리더 중복 낭독을 만들지 않는다. */}
          <button
            type="button"
            aria-pressed={message.user_rating === "GOOD"}
            aria-label="이 답변이 도움됐어요"
            title="이 답변이 도움됐어요"
            onClick={() => onRate(message.id, "GOOD")}
            className={`${RATE_BASE} ${message.user_rating === "GOOD" ? RATE_SELECTED : RATE_IDLE}`}
          >
            <IconThumbUp size={18} filled={message.user_rating === "GOOD"} />
          </button>
          <button
            type="button"
            aria-pressed={message.user_rating === "BAD"}
            aria-label="이 답변이 아쉬워요"
            title="이 답변이 아쉬워요"
            onClick={() => onRate(message.id, "BAD")}
            className={`${RATE_BASE} ${message.user_rating === "BAD" ? RATE_SELECTED : RATE_IDLE}`}
          >
            <IconThumbDown size={18} filled={message.user_rating === "BAD"} />
          </button>
          {renderReportAction?.(message.id)}
        </div>
      )}
    </div>
  );
}
