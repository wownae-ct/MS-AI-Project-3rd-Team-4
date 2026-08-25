// 회귀 테스트 — 사용자 리포트(2026-08-26) "AI 상담 시 유저 질문을 입력하면 사라진다".
//
// 재현 조건: 세션이 없는 상태(sessionId=null)에서 첫 메시지를 보내면 handleSend가
// createChatSession → onSessionCreated(id) 순으로 부모의 sessionId를 바꾼다. 그 prop 변경이
// ChatPanel의 `useEffect([sessionId])`(히스토리 복원)를 재실행시키는데, 이 시점엔 아직
// sendChatMessage가 스트리밍 중이라 서버가 user 메시지를 저장 전일 수 있다 — getChatMessages가
// 빈 배열을 돌려주면 그걸로 setMessages를 덮어써서 방금 낙관적으로 넣은 사용자 질문 말풍선이
// 사라졌다. 실제 부모(CategoryPage/ChatPage)와 같은 prop 스레딩을 재현하려면 sessionId를 실제
// state로 들고 있는 래퍼가 필요하다 — onSessionCreated를 no-op으로 두면 애초에 prop이 안
// 바뀌어 버그 자체가 재현되지 않는다.
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatSession } from "../model";
import { ChatPanel } from "./ChatPanel";

const createChatSessionMock = vi.fn();
const getChatMessagesMock = vi.fn();
const sendChatMessageMock = vi.fn();

vi.mock("../api/chat", () => ({
  createChatSession: (categoryCode?: string) => createChatSessionMock(categoryCode),
  getChatMessages: (sessionId: string) => getChatMessagesMock(sessionId),
  sendChatMessage: (...args: unknown[]) => sendChatMessageMock(...args),
  rateChatMessage: vi.fn(),
}));

function Harness() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  return <ChatPanel sessionId={sessionId} onSessionCreated={setSessionId} />;
}

const SESSION: ChatSession = { id: "s1", category_code: null, title: null, created_at: "" };

beforeEach(() => {
  createChatSessionMock.mockReset();
  getChatMessagesMock.mockReset();
  sendChatMessageMock.mockReset();
});

describe("첫 메시지 전송 — 세션 생성 경합", () => {
  it("세션이 막 만들어진 직후에도 방금 보낸 사용자 질문이 화면에 남는다", async () => {
    const user = userEvent.setup();
    createChatSessionMock.mockResolvedValue(SESSION);
    // 경합 재현: 세션이 막 생성된 시점엔 서버에 메시지가 아직 없어 빈 배열이 돌아올 수 있다.
    getChatMessagesMock.mockResolvedValue({ messages: [] });
    sendChatMessageMock.mockImplementation(
      async (_sessionId: string, _content: string, handlers: { onDone: (p: { message_id: string; latency_ms: number }) => void }) => {
        handlers.onDone({ message_id: "m1", latency_ms: 10 });
      },
    );

    render(<Harness />);
    await user.type(screen.getByPlaceholderText("메시지를 입력하세요"), "예산 얼마나 들어요?");
    await user.click(screen.getByRole("button", { name: "보내기" }));

    expect(await screen.findByText("예산 얼마나 들어요?")).toBeInTheDocument();
    // 방금 이 컴포넌트가 만든 세션이므로 히스토리 재조회 자체를 건너뛰어야 한다 — 이게
    // 실제 수정 내용이다(그 재조회 응답이 덮어쓰기의 원인이었다).
    expect(getChatMessagesMock).not.toHaveBeenCalled();
  });

  it("이미 존재하던 세션으로 들어오면 히스토리를 정상적으로 불러온다", async () => {
    getChatMessagesMock.mockResolvedValue({
      messages: [{ id: "old-1", role: "user", content: "이전 질문", created_at: "" }],
    });

    render(<ChatPanel sessionId="existing" onSessionCreated={() => {}} />);

    expect(await screen.findByText("이전 질문")).toBeInTheDocument();
    expect(getChatMessagesMock).toHaveBeenCalledWith("existing");
  });
});
