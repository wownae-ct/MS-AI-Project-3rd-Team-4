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
import { act, render, screen } from "@testing-library/react";
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

// 회귀 테스트 — 레드팀 감사 #16 "CRAG 재시도 시 1차 답변이 즉시 통째로 사라진다".
//
// 백엔드는 verify가 WEAK/GENERAL이면 retrieve→generate→verify를 최대 1회 다시 돌고, 그 직전에
// `retry` 이벤트를 흘려보낸다(backend/app/rag/graph.py::retrieve_node). 예전 ChatPanel은 그 신호를
// 받는 즉시 draft를 비워서, 2차 첫 토큰이 도착하기까지의 공백 동안 사용자가 읽던 문장이 눈앞에서
// 사라졌다. 이제는 버리는 시점을 "2차 첫 토큰 도착"으로 미룬다 — 아래 세 테스트가 그 계약을 고정한다.
//
// ⚠️ 두 번째 테스트가 이 수정의 핵심 함정을 잡는다. onToken은 원래 `cur.content + delta`로
// **누적**하므로, 1차를 남겨두기만 하고 교체 처리를 안 하면 2차 답변이 1차 뒤에 이어붙는다.
type RetryHandlers = {
  onToken: (delta: string) => void;
  onRetry?: (reason: string) => void;
  onDone: (payload: { message_id: string; latency_ms: number }) => void;
};

// SSE 이벤트를 **한 틱에 몰아서** 부르면 안 된다 — draftRef 미러는 setDraft updater 안에서
// 갱신되므로(ChatPanel.tsx 머리말), React가 그 사이에 flush 하지 못하면 onDone 이 낡은 ref 를
// 읽는다. 실제 네트워크에서는 청크마다 read() 가 끊기며 자연히 flush 된다. 그 타이밍을 재현하려고
// 핸들러만 가로챈 뒤 테스트가 act() 로 한 이벤트씩 흘려보낸다.
describe("CRAG 재시도 — 1차 답변 표시", () => {
  let handlers: RetryHandlers;

  async function startSend() {
    const user = userEvent.setup();
    getChatMessagesMock.mockResolvedValue({ messages: [] });
    sendChatMessageMock.mockImplementation((_sessionId: string, _content: string, received: RetryHandlers) => {
      handlers = received;
      return Promise.resolve();
    });
    render(<ChatPanel sessionId="s1" onSessionCreated={() => {}} />);
    await user.type(screen.getByPlaceholderText("메시지를 입력하세요"), "예식장 어디가 좋아요?");
    await user.click(screen.getByRole("button", { name: "보내기" }));
  }

  /** 이벤트 하나를 흘려보내고 React 가 렌더를 반영할 때까지 기다린다. */
  async function emit(event: (h: RetryHandlers) => void) {
    await act(async () => {
      event(handlers);
      await Promise.resolve();
    });
  }

  it("재시도 신호를 받아도 1차 답변이 화면에 남는다", async () => {
    await startSend();
    await emit((h) => h.onToken("1차 답변입니다."));
    await emit((h) => h.onRetry?.("근거가 부족합니다"));

    expect(screen.getByText("1차 답변입니다.")).toBeInTheDocument();
    expect(screen.getByText("더 정확한 답변을 다시 찾고 있어요")).toBeInTheDocument();
  });

  it("2차 첫 토큰은 1차를 이어붙이지 않고 교체한다", async () => {
    await startSend();
    await emit((h) => h.onToken("1차 답변입니다."));
    await emit((h) => h.onRetry?.("근거가 부족합니다"));
    await emit((h) => h.onToken("2차 답변입니다."));

    expect(screen.getByText("2차 답변입니다.")).toBeInTheDocument();
    // 이어붙었다면 "1차 답변입니다.2차 답변입니다."가 되어 이 조회가 실패한다.
    expect(screen.queryByText(/1차 답변입니다\./u)).not.toBeInTheDocument();
    // 2차가 흐르기 시작하면 재검색 안내도 내려간다.
    expect(screen.queryByText("더 정확한 답변을 다시 찾고 있어요")).not.toBeInTheDocument();
  });

  it("완결된 답변으로는 2차 내용만 저장된다", async () => {
    await startSend();
    await emit((h) => h.onToken("1차 답변입니다."));
    await emit((h) => h.onRetry?.("근거가 부족합니다"));
    await emit((h) => h.onToken("2차 답변입니다."));
    await emit((h) => h.onDone({ message_id: "m2", latency_ms: 20 }));

    expect(screen.getByText("2차 답변입니다.")).toBeInTheDocument();
    expect(screen.queryByText(/1차 답변입니다\./u)).not.toBeInTheDocument();
  });
});
