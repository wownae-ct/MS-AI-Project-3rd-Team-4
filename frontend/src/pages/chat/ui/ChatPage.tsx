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

export function ChatPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  return (
    <Page title="AI상담" subtitle="결혼 준비 중 궁금한 점을 자유롭게 물어보세요.">
      <ChatPanel
        sessionId={sessionId}
        onSessionCreated={setSessionId}
        renderReportAction={(messageId) => <ReportButton targetType="CHAT_MESSAGE" targetId={messageId} />}
      />
    </Page>
  );
}
