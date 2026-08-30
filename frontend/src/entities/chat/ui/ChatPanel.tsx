// AI상담 채팅 UI — HANDOFF.md §4 S3: 답변엔 항상 출처 배지 또는 "근거 없음" 표시, SSE 스트리밍.
//
// entities/chat 소속이다(원래 pages/category/ui/ 에 있었으나 2026-08-24, 하단 탭 "AI상담"(/chat,
// docs/wedding/plan/new/12_final_prototype_mockup.html — S3 안에서만 쓰던 목업 세트엔 없던,
// 최종 프로토타입에만 있는 5번째 탭)이 생기면서 두 화면(pages/category, pages/chat)이 같은 채팅
// UI를 써야 했다. `.oxlintrc.json`의 pages override(그룹 `@/pages/*/**`)가 페이지 간 내부 파일
// 직접 참조를 막아 pages/chat 이 pages/category 내부를 가져올 수 없다 — entities 는 여러 페이지가
// 공유하는 슬라이스이므로(layers.md) 여기로 옮기는 게 맞는 위치다. FSD 공식 세그먼트 5종에 `ui`가
// 포함되므로 entities 에 `ui` 세그먼트를 두는 것 자체는 규범 위반이 아니다.
//
// **[2026-08-27 정정]** 위 문단은 이 파일이 옮겨진 시점의 배경 설명일 뿐, 지금의 실제 사용처를
// 뜻하지 않는다 — 카테고리별 AI상담 탭은 2026-08-26 사용자 지시로 빠졌다(pages/category/ui/
// CategoryPage.tsx 주석). 지금은 `pages/chat/ui/ChatPage.tsx` 하나만 이 컴포넌트를 쓴다. 그래도
// 파일 위치는 entities 그대로 둔다 — 다시 카테고리 탭이 생겨도 옮길 필요가 없고, pages 밑에 두면
// 나중에 재사용이 필요해질 때 같은 `.oxlintrc.json` 제약에 다시 걸린다.
//
// 세션은 첫 메시지 전송 시점에만 생성한다(탭을 열자마자 만들지 않음 — 체크리스트/비용 탭만 보고
// 나가는 방문마다 세션이 쌓이는 것을 막는다). 세션 id는 호출자(CategoryPage/ChatPage)가 들고
// 있다가 이 컴포넌트에 내려준다 — Base UI Tabs.Panel이 비활성 탭을 언마운트할 수 있어(keepMounted
// 기본값 미확인), 이 컴포넌트 로컬 state에만 두면 탭을 나갔다 돌아올 때 세션을 잃을 수 있다.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui";
import { getChatMessages, rateChatMessage } from "../api/chat";
import type { ChatMessage, MessageRating } from "../model";
import { MessageBubble } from "./MessageBubble";
import { StreamingDraft } from "./StreamingDraft";
import { useChatStream } from "./use-chat-stream";
import { useStickyScroll } from "./use-sticky-scroll";

// 대화 표면 — **[2026-08-30] `shared/ui/Card` 를 쓰지 않는다.**
//
// 이 화면은 **뷰포트가 곧 예산**이라 안쪽 패딩을 모바일에서 16px → 12px 로 줄여야 하는데,
// `Card` 로는 그걸 **호출부에서 못 한다** — `Card` 의 `BASE` 가 `p-4` 를 정적 룩업으로 못박고
// 있어서 여기서 `px-3` 을 덧붙여 덮으려 하면 **조용히 실패한다**: Tailwind 는 클래스를 적은
// 순서가 아니라 **생성 CSS 순서**로 승부를 내고 그 순서는 우리가 못 정한다
// (`pages/chat/ui/ChatPage.tsx` 의 헤더 버튼이 같은 함정을 같은 이유로 기록해 뒀다).
// 남은 선택지는 ①`Card` 에 변형을 새로 여는 것과 ②여기서 직접 그리는 것인데, 이 모양을 쓰는
// 호출부가 하나뿐이라 공유 컴포넌트를 넓힐 근거가 없다 — `ChatHistoryDrawer` 와 `ChatPage` 헤더
// 버튼이 이미 같은 판단을 내렸다.
//
// ⚠️ 아래 문단에 **옛 유틸리티 이름을 평문으로 적지 않는다** — Tailwind 는 소스를 파싱하지 않고
// 평문으로 훑으므로 주석 속 클래스명 하나가 그대로 산출 CSS 를 만든다. 실제로 이 주석의 첫 판이
// 「위아래만 그리는 보더」의 이름을 적었다가 아무도 안 쓰는 규칙 하나를 CSS 에 실었다
// (`scripts/lib/__tests__/ghost-candidates.test.mjs` 가 그 부재를 고정한다).
//
// 🚨 **[개정] 이 표면은 화면 끝까지 흐르지 않는다.** 첫 판은 모바일에서 음수 가로 마진으로 `Page`
// 의 가로 패딩을 상쇄하고 **위아래 2면만** 테두리를 그렸다. 폭은 벌었지만 **두 가지를 동시에
// 잃었다**:
//   ① 좌우 테두리 — "화면 끝에 닿은 세로선은 잘린 자국으로 보인다"고 판단했는데, 실제로는
//      **「열려 있는 면」**으로 읽혔다(사용자 리포트 2026-08-30 "좌우측면이 열려있는 느낌").
//   ② **카드를 카드로 보이게 하던 주력** — 그건 1px 선이 아니라 **둘러싼 페이지 배경 면적**이었다.
//      `line`(#e7e3de) 은 `surface`(#ffffff) 대비 **1.28:1** 이라(a11y.md §3.3) 배경 대비 없이는
//      사실상 안 보인다. 전폭으로 흘리는 순간 카드의 경계가 통째로 사라졌다.
// 그래서 음수 마진을 버리고 `Page` 의 `px-3`(12px) 안에 그냥 들어온다 — **제목과 카드 왼쪽 끝이
// 같은 선에 서고**, `CONTAINER_FILL` 의 패딩과 여기 마진이 서로를 상쇄하던 **깨지기 쉬운 짝도
// 함께 사라진다**(그런 짝이 지켜지지 않았던 전례가 `shared/ui/shell-metrics.ts` 머리말에 있다).
//
// `rounded-lg border` 는 **조건 없이** 건다 — 어느 폭에서도 4면이다. `md:` 가 맡는 것은 이제
// 안쪽 여백과 간격뿐이고, 그 값은 종전 `Card` 와 같다(`p-4` · `gap-3`).
//
// `bg-surface` 는 **유지한다.** 어시스턴트 말풍선이 `bg-bg`(MessageBubble.tsx)라, 표면을 `bg-bg` 로
// 바꾸면 말풍선이 배경에 녹아 사라진다. `Card` 가 주던 `@container` 만 버린다 — 채팅 UI 안에
// 컨테이너 쿼리 변형을 쓰는 곳이 0건이라(전수 확인) 잃는 것이 없다.
const SURFACE =
  "flex min-h-0 flex-1 flex-col gap-2 rounded-lg border border-line bg-surface px-3 py-3 " +
  "md:gap-3 md:px-4 md:py-4";

// 「맨 아래로」 — 아래 `stickToBottomRef` 가 풀렸을 때만 뜬다. 상자를 44×44 로 **실제로** 그린다:
// a11y.md §1.5 의 「36px 상자 + 의사요소」 수법은 목록 위에 겹치는 이 자리에 쓸 수 없다(넘친 히트
// 영역이 아래 말풍선의 평가 버튼을 뺏는다).
// D18 — 화살표 문자 글리프를 쓰지 않는다. 낱말만으로 뜻이 온전하다.
const JUMP_BUTTON =
  "absolute right-2 bottom-2 inline-flex min-h-tap min-w-tap cursor-pointer items-center " +
  "justify-center rounded-md border border-line bg-surface px-3 text-xs font-bold text-ink-soft " +
  "transition-colors duration-150 hover:border-ink-soft hover:text-ink";

interface ChatPanelProps {
  /**
   * `CategoryPage`(S3)는 고정 문자열을 준다 — 사용자가 이미 카테고리를 골라 들어왔으므로.
   * `ChatPage`(하단 탭 "AI상담")는 아예 생략한다 — 카테고리 무관 전역 상담이다
   * (backend PR #50, 2026-08-24 머지: `POST /chat/sessions`의 category_code가 optional로
   * 열렸고 RAG 검색도 필터 없이 전체 대상으로 동작한다). 예전엔 백엔드가 이걸 지원 못 해서
   * 첫 메시지 내용을 클라이언트에서 키워드로 훑어 카테고리를 추측하는 임시방편
   * (`pages/chat/lib/classify-category.ts`)을 썼는데, 백엔드가 열리면서 그 파일과 이 prop의
   * 함수 형태는 전부 걷어냈다 — 더 이상 "언제 어떤 카테고리를 쓸지 추측"할 필요가 없다.
   */
  categoryCode?: string;
  sessionId: string | null;
  onSessionCreated: (id: string) => void;
  /** entities 레이어 교차import 제약 때문에 pages(CategoryPage/ChatPage)가 내려주는 신고(F13)
      버튼 렌더러 — 자세한 이유는 MessageBubble.tsx 머리말 참고. */
  renderReportAction?: (messageId: string) => ReactNode;
}

export function ChatPanel({ categoryCode, sessionId, onSessionCreated, renderReportAction }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  // 전송 1건 = SSE 스트림 1개. 그 상태 기계 전부(draft·stage·retrying·sending·error)는
  // `use-chat-stream.ts` 가 갖는다 — 그 파일 머리말에 「동기 진실은 ref, setState 는 미러」
  // 규약과 그것이 고친 버그(재생성한 답변에 근거가 안 붙던 문제)의 사정이 있다.
  const chat = useChatStream({ sessionId, categoryCode, onSessionCreated, setMessages });
  // 🚨 둘 다 `useCallback([])` 이라 아래 세션 effect 의 의존성에 넣어도 재실행을 유발하지 않는다 —
  // `stickToBottom` 과 같은 사정이다(그 안정성이 깨지면 렌더마다 스트림이 abort 된다).
  const { resetForSession, consumeSkipHistoryFetch } = chat;
  // 목록 스크롤 — 「사용자가 위로 올려 읽는 중이면 자동으로 내리지 않는다」가 이 훅의 전부다.
  // 사유와 ref/state 를 가른 근거는 `use-sticky-scroll.ts` 머리말에 있다.
  const { listRef, onListScroll, awayFromBottom, jumpToBottom, stickToBottom } = useStickyScroll(messages, chat.draft);
  // 평가(좋아요/싫어요) 연타 가드 — 메시지별 "가장 최근 요청" 일련번호. 응답이 보낸 순서와 다르게
  // 도착해도, 이 메시지에 대해 자신이 아직 최신 요청일 때만 실패 롤백을 적용한다(레드팀 감사:
  // 안 그러면 나중에 보낸 성공 결과를 먼저 보낸 요청의 실패 롤백이 덮어쓸 수 있다).
  const ratingSeqRef = useRef<Map<string, number>>(new Map());

  // 세션 전환 → 화면 정합성. **이 컴포넌트는 원래 "세션은 한 번 정해지면 안 바뀐다"는 전제로
  // 쓰여 있었다** — 호출자가 하나뿐(ChatPage)이고 그쪽도 sessionStorage에 담긴 세션 하나만
  // 들고 있었기 때문이다. 지난 대화 목록(레드팀 #17, 2026-08-29)이 그 전제를 처음으로 깬다.
  // 아래 리셋이 없으면 목록에서 대화를 갈아탈 때 네 가지가 한꺼번에 어긋난다:
  //   ① A→B 전환 중 B 히스토리가 도착하기 전까지 A 대화가 B의 내용인 척 보이고, 그 조회가
  //      실패하면(아래 catch가 아무것도 안 한다) A 대화가 B 화면에 **영구히** 남는다.
  //   ② A→null("새 대화")은 옛 `if (!sessionId) return`에 걸려 아예 돌지 않았다 — 새 대화를
  //      눌렀는데 옛 대화가 그대로 보인다.
  //   ③ 진행 중이던 SSE 스트림이 안 끊겨 **다른 세션 화면에 토큰이 흘러든다.**
  //   ④ draft·error·stage·retrying·평가 일련번호도 전부 세션에 종속된 상태다.
  useEffect(() => {
    // ⚠️ 이 조기 반환은 반드시 아래 리셋보다 **위**에 있어야 한다. 이 경로는 "방금 이
    // 컴포넌트가 첫 메시지를 보내며 스스로 만든 세션"이라, 낙관적 user 말풍선과 진행 중인
    // 스트림이 그대로 살아 있어야 한다 — 여기서 리셋하면 2026-08-26에 이미 한 번 고쳤던
    // "유저의 질문이 사라져" 버그가 그대로 재발한다.
    if (consumeSkipHistoryFetch()) return;

    // 진행 중이던 스트림 abort · 입력창 잠금 해제 · draft/stage/retrying/error 비우기까지
    // 한 번에 한다(`use-chat-stream.ts`).
    resetForSession();
    setMessages([]);
    ratingSeqRef.current.clear();
    // 스크롤 위치도 세션에 종속된 상태다 — A 대화에서 위로 올려 읽던 상태가 그대로 남으면 B 대화의
    // 히스토리가 도착해도 화면이 맨 위에 머물고 「맨 아래로」 버튼만 떠 있다.
    stickToBottom();

    if (!sessionId) return; // 새 대화 — 비우기만 하고 조회할 히스토리가 없다.

    let cancelled = false;
    getChatMessages(sessionId)
      .then((res) => {
        if (!cancelled) setMessages(res.messages);
      })
      .catch(() => {
        // 히스토리 복원 실패는 새 대화를 막지 않는다 — 위에서 이미 비웠으므로 빈 목록으로 남는다.
      });
    return () => {
      cancelled = true;
    };
    // 세 콜백 모두 `useCallback([])` 로 안정적이라 이 effect 를 다시 돌리지 않는다 —
    // 그 안정성이 깨지면 렌더마다 여기가 재실행돼 진행 중인 스트림이 abort 된다(각 훅의 주석 참고).
  }, [sessionId, stickToBottom, resetForSession, consumeSkipHistoryFetch]);

  // 입력창 → 스트림. 전송 자체는 `use-chat-stream.ts` 가 하고 여기서는 이 화면에만 있는 두
  // 가지를 얹는다 — 입력 비우기와 「맨 아래로 다시 붙이기」.
  //
  // ⚠️ IME 조합 확정 시 Enter 키다운이 두 번 잡히면 이 함수도 두 번 돈다. 두 번째 호출은 이미
  // 비워진 `input` 을 보고 여기서 되돌아가고, 그마저 통과해도 훅 안의 `sendingRef` 락이 막는다.
  function handleSend() {
    const content = input.trim();
    if (content === "") return;
    setInput("");
    // 내가 방금 보낸 질문은 위로 올려 읽던 중이었어도 반드시 보여야 한다 — 여기서 다시 붙인다.
    stickToBottom();
    void chat.send(content);
  }

  // AI 답변에만 호출된다(greeting/draft는 MessageBubble에 onRate를 안 넘겨서 애초에 버튼이 안
  // 뜬다) — 이 시점엔 sessionId가 이미 실제 값이다(메시지가 존재한다는 건 세션도 있다는 뜻).
  // 낙관적 갱신 후 실패하면 되돌리고 에러를 보여준다(이 프로젝트 컨벤션 — 조용히 삼키지 않는다).
  async function handleRate(messageId: string, rating: MessageRating) {
    if (!sessionId) return;
    const seq = (ratingSeqRef.current.get(messageId) ?? 0) + 1;
    ratingSeqRef.current.set(messageId, seq);
    const previous = messages.find((m) => m.id === messageId)?.user_rating ?? null;
    setMessages((msgs) => msgs.map((m) => (m.id === messageId ? { ...m, user_rating: rating } : m)));
    try {
      await rateChatMessage(sessionId, messageId, rating);
    } catch (err) {
      // 이 요청이 이 메시지에 대한 "가장 최근" 평가 시도일 때만 되돌린다 — 그 사이 사용자가
      // 이미 다른 평가를 다시 눌렀다면(더 최신 요청이 존재) 그 결과를 덮어쓰면 안 된다
      // (레드팀 감사: 먼저 보낸 요청의 실패 롤백이 나중에 보낸 요청의 성공 상태를 덮어쓰던 경합).
      if (ratingSeqRef.current.get(messageId) === seq) {
        setMessages((msgs) => msgs.map((m) => (m.id === messageId ? { ...m, user_rating: previous } : m)));
      }
      chat.setError(err instanceof ApiError ? err.message : "평가를 저장하지 못했습니다.");
    }
  }

  return (
    <div className={SURFACE}>
      {/* 이 래퍼는 「맨 아래로」 버튼의 배치 기준일 뿐이다 — 버튼을 목록 **안**에 두면 스크롤과 함께
          떠내려가고, `role="log"` 안에 들어가 라이브 리전 낭독까지 오염시킨다. 그래서 밖에 둔다. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* role="log" + aria-live="polite" — 스트리밍 토큰/출처 배지/검증 결과가 이 컨테이너에
            조용히 추가되기만 해서, 이전엔 스크린리더가 답변이 도착한다는 사실 자체를 몰랐다
            (레드팀 감사). aria-relevant="additions text" 로 텍스트 갱신까지 announce 한다 — 매
            토큰마다 announce 되면 너무 시끄러우니 스트리밍 도중이 아니라 완결 단위(문단)로 뜨는
            기본 동작에 맡긴다. */}
        {/* [2026-08-27 개편] dvh% 클램프를 flex-1 min-h-0로 교체 — 사용자 요청("대화창이 꽉 차지
            않고 작게 보인다", iPhone 16 Pro 실기기). 이전엔 62dvh 같은 퍼센트를 감으로 잡았는데,
            세로가 긴 기기에서는 그 상한 아래로 실제 여유 공간이 남아도 못 채웠다 — 그 캡을 보수적
            으로 잡은 이유 자체는 정당했다(모바일 하단 탭바+헤더+입력행을 다 얹으면 70dvh 이상에서
            페이지 자체가 세로 스크롤돼 스크롤 영역이 이중이 됐다), 다만 해결 방법이 틀렸다. 이제는
            이 컴포넌트가 감싼 표면(위 `SURFACE`)과 `ChatPage.tsx`가 `Page fill`로 넘겨준 뷰포트-고정
            높이 체인(shared/ui/Page.tsx) 안에서 "남는 공간 전부"를 flex가 정확히 계산해 채운다 —
            퍼센트를 다시 조정할 필요 없이 헤더/입력행 높이가 바뀌어도 자동으로 맞다. */}
        <div
          ref={listRef}
          onScroll={onListScroll}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
        >
          {messages.length === 0 && !chat.draft && (
            // 첫 진입 안내를 회색 텍스트가 아니라 어시스턴트 말풍선으로 보여준다(사용자 요청,
            // 2026-08-24) — 실제 대화 내역이 아니라 화면에서만 합성한 안내라 id="greeting"으로
            // 구분하고 서버에 저장되지 않는다. MessageBubble을 그대로 재사용해 실제 답변 말풍선과
            // 시각적으로 같은 규범(모양/여백/타이포)을 따르게 한다.
            <MessageBubble
              message={{
                id: "greeting",
                role: "assistant",
                content: categoryCode === undefined ? "무엇이 궁금하세요?" : "이 카테고리에 대해 무엇이 궁금하세요?",
                created_at: new Date(0).toISOString(),
              }}
            />
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} onRate={handleRate} renderReportAction={renderReportAction} />
          ))}
          {chat.draft && <StreamingDraft draft={chat.draft} stage={chat.stage} retrying={chat.retrying} />}
        </div>

        {/* 스트리밍 중 위로 올려 읽는 동안 새 토큰이 계속 쌓이므로, 돌아갈 길을 한 번의 탭으로
            남긴다. 따라가는 중일 때는 아예 렌더하지 않는다 — 늘 떠 있으면 말풍선을 가리기만 한다. */}
        {awayFromBottom && (
          <button type="button" onClick={jumpToBottom} className={JUMP_BUTTON}>
            맨 아래로
          </button>
        )}
      </div>

      {chat.error && (
        <p role="alert" className="rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
          {chat.error}
        </p>
      )}

      {/* 🚨 [2026-08-29 개정] `min-w-0` + `shrink-0` 은 여전히 이 행의 계약이고, **계약 지점이
          하나 늘었다** — 아래 `<label>` 이 새 flex 아이템이라 `min-w-0` 을 label 과 input **양쪽**
          에 줘야 한다(label 만 주면 input 이, input 만 주면 label 이 안 줄어든다).

          [2026-08-29 높이 개편] 컨트롤이 세로로 무겁다는 사용자 요청으로 **보이는 높이를 36px 로
          낮추되 터치 타겟 44px 은 그대로 둔다**(docs/design/a11y.md §1.5 계약).
            · 입력  — `<label>` 이 44px, 그 안의 `<input>` 이 36px. 라벨 클릭은 그 컨트롤에 포커스를
                      주므로 위아래 4px 띠를 눌러도 입력이 잡힌다. 의사요소 없이 히트 영역이 남는다.
            · 보내기 — 공용 `Button` 의 `size="sm"`(그 파일 `SIZE` 주석에 산술이 있다).
          `text-base`(16px)는 **유지한다** — a11y.md §2.5 「입력 필드 16px 미만 금지」. 16px × 행간
          1.6 = 25.6px 이라 36px 상자에 들어간다.

          `<label>` 은 접근명도 함께 고친다 — 종전에 이 입력의 이름은 `placeholder` 뿐이었다.
          placeholder 는 값이 입력되면 사라지므로 이름의 자리가 아니다.

          ── 아래는 이 행이 원래 왜 이 계약을 갖게 됐는지 (2026-08-29) ──
          320px 급 기기에서 입력창과 「보내기」가 화면 밖으로 잘려 나갔다(사용자 리포트).
          원인은 **폼 컨트롤의 자동 최소 크기**다. `<input>` 은 `size` 속성(기본 20)에서 오는
          내재 폭을 갖고, flex 아이템의 `min-width: auto` 가 그 값으로 잡힌다 — `flex-1` 을 줘도
          약 200px 아래로는 **줄지 않는다.** 여기에 안 눌리는 버튼(약 76px)과 gap 8px 을 더하면
          최소 폭이 약 284px 인데, 카드 안쪽 폭은 320px 기기에서 254px 뿐이다. 부모(`Page fill`)가
          `overflow-hidden` 이라 넘친 만큼이 스크롤되지 않고 그냥 **잘렸다.**
          `min-w-0` 은 그 자동 최소 크기를 0 으로 되돌리고, `shrink-0` 은 그 대가로 버튼이 눌리지
          않게 한다. 둘은 **짝이다.** 같은 짝을 `shared/ui/DateField.tsx`(INPUT_BASE)와
          `TotalBudgetField` 가 이미 쓴다.

          ⚠️ D19(조판 규칙) 직후 이 자리가 더 나빠졌다. 종전엔 `overflow-wrap: anywhere` 가
          버튼의 최소 폭을 1글자로 만들어 「보/내/기」로 접히면서 넘침을 약 5px 로 **가리고**
          있었다. D19 가 그 붕괴를 막자 남아 있던 진짜 결함(입력의 최소 폭)이 그대로 드러났다. */}
      <div className="flex items-center gap-2">
        <label className="flex min-h-tap min-w-0 flex-1 items-center">
          <span className="sr-only">메시지</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSend();
            }}
            placeholder="메시지를 입력하세요"
            disabled={chat.sending}
            className="h-9 w-full min-w-0 rounded-md border border-line bg-surface px-3 text-base text-ink disabled:opacity-50"
          />
        </label>
        {/* [2026-08-27] 이전엔 raw <button>이라 shared/ui/Button.tsx의 `inline-flex items-center
            justify-center` 컨벤션이 빠져 있었다 — 상자가 텍스트 줄높이보다 클 때 콘텐츠를 수직
            중앙 정렬하는 이 프로젝트의 표준 방식인데, 여기만 누락돼 입력창과 글자 위치가 안 맞아
            보였다(사용자 리포트, 아이폰 실기기). 직접 유틸리티를 추가하는 대신 공용 Button으로
            교체 — 새 위치에서 같은 버그가 재발할 여지 자체를 없앤다. */}
        <Button size="sm" className="shrink-0" onClick={handleSend} disabled={chat.sending || !input.trim()}>
          보내기
        </Button>
      </div>
    </div>
  );
}
