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
import { Page } from "@/shared/ui";

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

export function ChatPage() {
  const [sessionId, setSessionId] = useState<string | null>(readStoredSessionId);

  function handleSessionCreated(id: string) {
    setSessionId(id);
    try {
      sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, id);
    } catch {
      // 프라이빗 모드 등 sessionStorage 를 못 쓰는 환경에서도 채팅 자체는 계속 동작해야 한다 —
      // 이 경우 재마운트 시 복구만 안 될 뿐 새 세션으로 계속 대화할 수 있다.
    }
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
      subtitle="결혼 준비 중 궁금한 점을 자유롭게 물어보세요."
      width="max-w-lg md:max-w-3xl lg:max-w-4xl"
      fill
    >
      <ChatPanel
        sessionId={sessionId}
        onSessionCreated={handleSessionCreated}
        renderReportAction={(messageId) => <ReportButton targetType="CHAT_MESSAGE" targetId={messageId} />}
      />
    </Page>
  );
}
