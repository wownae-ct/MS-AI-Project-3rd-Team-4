// S3(카테고리 상세) 밖에서 진입하는 5번째 하단 탭 "AI상담" — 시각 근거:
// docs/wedding/plan/new/12_final_prototype_mockup.html 의 renderApp() 탭바(2026-08-24 발견,
// 이전까지 이 저장소가 참조한 frontend/docs/mockups/*.html + HANDOFF.md 세트에는 이 탭이
// 아예 없었다 — 그쪽은 00_BASELINE.md §7 화면표대로 AI상담을 S3 안의 탭 3개 중 하나로만
// 그렸다). 최종 프로토타입은 같은 화면을 **두 진입점**으로 그린다 — S3 안(카테고리 지정)과
// 이 5번째 탭(state.tab==='chat', renderChat(null) = 카테고리 없는 일반 상담).
//
// **처음엔 카테고리 없는 상담을 못 만들었다** — 백엔드가 category_code를 필수로 요구했고 RAG
// 검색 쿼리도 카테고리 필터를 SQL에 하드코딩해서, 사용자가 명시적으로 거부한(2026-08-24,
// "카테고리별로 어떤 카테고리에서 물을지 선택하라는데... 사용자가 걍 대화 시작하면 알아서
// rag에서 찾으면 되는거잖아") 카테고리 선택 화면 대신 첫 메시지를 키워드로 훑어 category_code를
// 추정하는 클라이언트 근사치(`classify-category.ts`)를 임시로 썼었다.
//
// **지금은 진짜로 카테고리 없이 보낸다** — 다른 세션이 backend PR #50(2026-08-24 머지)로
// `POST /chat/sessions`의 category_code를 optional로 열고 RAG 검색도 필터 없이 전체 대상으로
// 동작하게 바꿨다. `ChatPanel`에 `categoryCode`를 아예 안 넘기면 그대로 전역 세션이 된다 —
// 클라이언트 추측 로직(`classify-category.ts`)과 "어떤 카테고리로 답변 중인지" 캡션은 더 이상
// 필요 없어 걷어냈다.
import { useState } from "react";
import { ChatPanel } from "@/entities/chat";
import { ReportButton } from "@/entities/feedback";
import { AI_CHAT_DISCLAIMER, AiDisclaimer, IconArchive, Page } from "@/shared/ui";
import { ChatHistoryDrawer } from "./ChatHistoryDrawer";

// 헤더의 「지난 대화」 아이콘 버튼.
//
// **`shared/ui/Button` 을 쓰지 않는다.** 이 자리에 필요한 것은 「36×36 정사각 · rounded-sm ·
// 탭바와 같은 아이콘 색」인데, `Button` 의 secondary 는 `rounded-md px-4`(→ 54×36)와 `text-ink` 를
// 정적 룩업으로 못박고 있다. 호출부에서 `rounded-sm`·`text-ink-soft` 를 덧붙여 이기려 하면
// **조용히 실패한다** — Tailwind 는 클래스 나열 순서가 아니라 **생성 CSS 순서**로 승부를 내고,
// 그 순서는 우리가 적는 자리가 아니라 테마 변수 선언 순서(`--radius-sm` 이 `--radius-md` 보다
// 먼저)가 정한다. 한 속성에 두 유틸리티를 얹는 방식 자체를 피한다.
// 남은 선택지는 ①`Button` 에 아이콘 전용 룩업 3종을 새로 여는 것과 ②여기서 직접 그리는 것인데,
// 호출부가 하나뿐이라 공유 컴포넌트를 넓힐 근거가 없다(`ChatHistoryDrawer` 머리말이 같은 판단을
// 같은 이유로 내렸다). `entities/chat/ui/MessageBubble.tsx` 의 평가 버튼이 이미 이 방식이다 —
// 다만 그쪽은 44×44 · `rounded-md` · `aria-pressed` 2채널이라 규격이 달라 공통화하지 않는다.
//
// 🚨 `h-9 w-9` 와 `after:*` 는 **짝이다.** 상자는 36×36 으로 그리고, 의사요소가 사방으로 4px 씩
// 넘쳐 히트 영역을 44×44 로 되돌린다(docs/design/a11y.md §1.5 의 44px 계약 — `Button` 의 `sm` 이
// 세로로만 하는 일을 여기선 가로까지 한다. 폭이 높이와 같아졌으므로 가로도 되살려야 한다).
// 짝이 깨져도 **화면에는 아무 변화가 없다** — ChatPage.test.tsx 가 계약으로 고정한다.
//
// 색은 하단 탭바의 비활성 아이콘과 **같은 토큰**(`text-ink-soft`)이다(app/ui/NavItem.tsx `BASE`).
// `text-ink` 였을 때 헤더 아이콘만 더 검고 무거웠다(사용자 리포트 2026-08-29). primary 는 쓰지
// 않는다 — 「현재 위치」도 「주요 행동」도 아니다(The One Accent Rule).
//
// `hover` 를 `enabled:` 뒤에 두는 것은 `shared/ui/Button.tsx` 가 세운 규약을 그대로 따르는 것이다.
// 포커스 링은 `shared/ui/styles.css` 의 전역 `:focus-visible` 이 준다 — 여기서 따로 그리지 않는다.
const HISTORY_BUTTON =
  "relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-sm border " +
  "border-line bg-surface text-ink-soft transition-[background-color,border-color,color] duration-150 " +
  "after:absolute after:-inset-1 " +
  "enabled:hover:border-ink-soft enabled:hover:bg-bg enabled:hover:text-ink";

// 하단 탭 전환은 이 컴포넌트를 언마운트한다 — sessionId 를 로컬 state에만 두면 전송 중 다른
// 탭으로 갔다 돌아왔을 때 sessionId=null 로 재마운트돼 이미 서버에 존재하는 세션이 영구히
// 고아가 된다(레드팀 감사 HIGH). sessionStorage 에 미러링해 재마운트 시 복구한다 — 브라우저
// 탭 하나의 수명 동안만 유지하면 충분하고(로그아웃 시 clear 할 이유가 딱히 없다), 여러 탭에
// 새 채팅을 강제하지 않는다.
const CHAT_SESSION_STORAGE_KEY = "merrymap.chat.global_session_id";

function readStoredSessionId(): string | null {
  try {
    return sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

// 프라이빗 모드 등 sessionStorage 를 못 쓰는 환경에서도 채팅 자체는 계속 동작해야 한다 —
// 이 경우 재마운트 시 복구만 안 될 뿐 새 세션으로 계속 대화할 수 있다.
function storeSessionId(id: string | null): void {
  try {
    if (id === null) sessionStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
    else sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, id);
  } catch {
    // 위 머리말 참고 — 저장 실패는 대화를 막지 않는다.
  }
}

export function ChatPage() {
  const [sessionId, setSessionId] = useState<string | null>(readStoredSessionId);
  // 지난 대화 목록(레드팀 감사 #17) — 열림 상태만 여기 있고 조회는 드로어가 스스로 한다.
  const [historyOpen, setHistoryOpen] = useState(false);

  // 진입 시 어떤 대화를 열지는 **바꾸지 않았다** — sessionStorage 에 값이 있으면 그 대화,
  // 없으면 새 대화. 목록은 순수하게 더해지는 기능이라 기존 동작에 회귀가 없다. 서버의 최신
  // 세션을 자동으로 여는 안은 택하지 않았다("새 질문을 하려고 들어왔는데 옛 대화가 열려
  // 있다"는 반대 불편이 생긴다).
  function handleSessionCreated(id: string) {
    setSessionId(id);
    storeSessionId(id);
  }

  function openSession(id: string) {
    setSessionId(id);
    storeSessionId(id);
    setHistoryOpen(false);
  }

  // 드로어에서 대화 1건이 실제로 삭제됐다 (2026-08-30).
  //
  // 🚨 **지금 열려 있는 대화였을 때만** 화면을 비운다 — 다른 대화를 지운 것은 이 화면과 무관하고,
  // 여기서 무조건 비우면 「목록 정리를 했더니 읽던 대화가 사라진다」가 된다.
  //
  // 비울 때 **미러도 함께 지운다.** 안 지우면 하단 탭을 옮겼다 돌아왔을 때 `readStoredSessionId`
  // 가 **이미 삭제된 세션 id** 를 복원해 빈 화면 + 다음 전송 404 가 된다(이 파일 머리말의
  // sessionStorage 미러 사정, `ChatPage.test.tsx` 가 「미러를 갱신해야 하는 지점」으로 셋을
  // 세어 뒀는데 이것이 **넷째**다).
  //
  // 진행 중이던 SSE 스트림은 따로 끊지 않아도 된다 — `sessionId` 가 `null` 로 바뀌면 `ChatPanel`
  // 의 세션 전환 effect 가 abort · 메시지 비우기 · 입력창 잠금 해제를 이미 전부 한다.
  function handleSessionDeleted(deletedId: string) {
    if (deletedId !== sessionId) return;
    setSessionId(null);
    storeSessionId(null);
  }

  function startNewSession() {
    // `null` 로 두면 `ChatPanel` 이 다음 첫 메시지 전송 때 새 세션을 만든다 — 탭만 열어 보고
    // 나가는 방문마다 빈 세션이 쌓이지 않게 하는 기존 규칙 그대로다.
    setSessionId(null);
    storeSessionId(null);
    setHistoryOpen(false);
  }

  return (
    // md 한 단계만 넓힌다(2xl→3xl) — 사용자 요청으로 채팅 칸을 키우되(2026-08-26), MessageBubble.tsx가
    // 말풍선을 max-w-[85%]로 잡아서 열을 너무 넓히면 줄길이가 늘어 가독성이 떨어진다. lg는 이미
    // 기본값(4xl)이라 그대로 둔다.
    //
    // `fill` — 대화창을 dvh% 클램프로 감으로 잡는 대신 뷰포트 남는 공간 전부를 쓰게 한다
    // (사용자 요청, iPhone 16 Pro처럼 세로가 긴 기기에서 62dvh 캡에 막혀 여백이 남던 문제,
    // 2026-08-27). ChatPanel.tsx의 메시지 목록도 같은 이유로 flex-1 min-h-0 체인으로 바꿨다 —
    // 이 페이지가 유일한 사용처라서(카테고리별 상담 탭은 2026-08-26 제거) 안전하게 스코프된다.
    <Page
      title="AI상담"
      // [2026-08-30] 부제를 **모바일에서만** 숨긴다(사용자 리포트: 대화창이 정사각형 · 높이가 짧다).
      // `Page` 의 `<p>` 는 그대로 렌더되지만 유일한 인라인 자식이 `display:none` 이라 줄상자가 만들어
      // 지지 않아 **높이가 0** 이 된다 — 헤더 높이는 제목 열(28px)이 아니라 「지난 대화」 버튼(36px)이
      // 정하므로 헤더가 52px → 36px 로 줄고, 그 16px 이 그대로 대화창이 된다.
      //
      // **잃는 것을 하나씩 되돌린 결과다** — 데스크톱은 그대로 보인다. 모바일에서 이 문장이 하던
      // 「무엇을 하는 화면인가」는 첫 진입 시 어시스턴트 말풍선 「무엇이 궁금하세요?」
      // (entities/chat/ui/ChatPanel.tsx)가 같은 자리에서 그대로 한다. 위치 안내는 `<h1>AI상담` 과
      // 하단 탭바의 `aria-current` 가 이미 두 채널로 준다.
      // ⚠️ `sr-only` 가 아니라 `hidden` 이다 — 스크린리더에도 안 읽혀야 위 말풍선과 중복되지 않는다.
      subtitle={<span className="hidden md:inline">결혼 준비 중 궁금한 점을 자유롭게 물어보세요.</span>}
      width="max-w-lg md:max-w-3xl lg:max-w-4xl"
      fill
      // `fill` 은 헤더 높이를 뺀 나머지를 대화창에 준다 — 트리거가 헤더를 두 줄로 만들면 그만큼
      // 대화창이 줄어든다. 한 줄에 들어가는 크기로 둔다.
      //
      // [2026-08-29] 버튼 높이 36px — 컨트롤이 세로로 무겁다는 사용자 요청. `fill` 화면이라 이 8px 은
      // 그대로 **대화창이 8px 커지는 것**으로 돌아온다. 터치 타겟은 44px 그대로다(위 `HISTORY_BUTTON`
      // 의 의사요소 짝). 같은 이유로 `ChatPanel` 의 입력행도 함께 낮췄다.
      //
      // [2026-08-29] 라벨을 아카이브 아이콘으로 바꿨다(사용자 요청). **이 한 자리에서만**
      // `shared/ui/icons.tsx` 머리말의 「아이콘만으로는 뜻이 전달되지 않으므로 라벨을 항상 함께
      // 표시한다」(NNG Icon Usability)를 벗어나므로 근거를 남긴다 — 잃는 것을 하나씩 되돌린 결과다:
      //   · 접근명은 `aria-label` 이 **같은 문자열**로 그대로 갖는다. 스크린리더가 듣는 것은 1바이트도
      //     달라지지 않으며, 이 화면의 테스트가 전부 `name: "지난 대화"` 로 이 버튼을 찾으므로
      //     `aria-label` 이 조용히 빠지면 접근명이 빈 문자열이 되어 **즉시 깨진다**(계약 고정).
      //   · 마우스 사용자에게는 `title` 이 같은 문자열을 노출한다. `aria-label` 과 **반드시 같은 값**
      //     이어야 한다 — 다르면 스크린리더가 둘 다 읽는다(MessageBubble.tsx 평가 버튼과 같은 처리).
      //   · 아이콘만 보이는 터치 사용자에게 남는 유일한 몫(한눈에 뜻)은 열어 보는 것으로 곧장
      //     확인된다 — 드로어 제목이 「지난 대화」이고, 파괴적 행동이 아니라 닫기 한 번으로 돌아온다.
      // 터치 타겟은 여전히 44×44 다 — 위 `HISTORY_BUTTON` 의 의사요소가 되살린다.
      actions={
        <button
          type="button"
          aria-label="지난 대화"
          title="지난 대화"
          onClick={() => setHistoryOpen(true)}
          className={HISTORY_BUTTON}
        >
          <IconArchive />
        </button>
      }
    >
      <ChatPanel
        sessionId={sessionId}
        onSessionCreated={handleSessionCreated}
        renderReportAction={(messageId) => <ReportButton targetType="CHAT_MESSAGE" targetId={messageId} />}
      />
      {/* 대화창 **아래**에 둔다 — 답변을 다 읽은 뒤 눈이 닿는 자리이고, 입력행 위로 올리면
          `fill` 레이아웃에서 대화창 높이를 그만큼 먹는다. 스크롤과 무관하게 항상 보인다. */}
      <AiDisclaimer>{AI_CHAT_DISCLAIMER}</AiDisclaimer>
      <ChatHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        currentSessionId={sessionId}
        onSelect={openSession}
        onNewSession={startNewSession}
        onDeleted={handleSessionDeleted}
      />
    </Page>
  );
}
