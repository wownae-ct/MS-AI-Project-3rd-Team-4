// 스트림이 **끝나는 순간**의 계약 — `ChatPanel.test.tsx` 와 파일을 나눈다(선례:
// `pages/budget/ui/BudgetPage.activation.test.tsx`). 그쪽은 진입·세션 전환·스크롤을 보고,
// 여기는 「마지막 이벤트들이 어떻게 도착하든 화면과 서버가 갈리지 않는다」 하나만 본다.
//
// ─────────────────────────────────────────────────────────────────────────────
// 회귀 ① — 사용자 리포트 2026-08-30 "재생성한 답변만 근거 항목이 바로 안 뜨고, 다른 화면을 갔다
// 와야 나온다".
//
// **정체는 draft 미러의 갱신 시점이었다.** 종전에는 `draftRef` 를 `setDraft(updater)` **안**에서
// 갱신했는데, React 는 한 배치의 첫 업데이트만 미리 계산하고 나머지는 렌더까지 미룬다. 백엔드는
// 꼬리 3종을 await 없이 연달아 보내므로(`citations`→`verification`→`done`) 셋이 한 청크·한
// 배치로 도착하고, `onDone` 이 **verification 이 빠진** 미러를 읽어 완결 메시지를 만들었다.
// `MessageBubble` 은 근거 블록 전체를 그 필드 하나로 게이트하므로 배지·출처·평가 버튼이 통째로
// 안 그려졌고, 다른 화면에 갔다 오면 `getChatMessages` 재조회가 서버 값으로 되살렸다.
//
// 🚨 그래서 아래 테스트들은 **일부러 한 `act()` 안에서 이벤트를 몰아친다.** 하나씩 흘리면 그
// 사이에 React 가 flush 해서 버그를 비껴간다 — 종전 테스트가 정확히 그렇게 비껴가고 있었다.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatCitation, ChatMessage, ChatSession, ChatVerification } from "../model";
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

type StreamHandlers = {
  onToken: (delta: string) => void;
  onCitations: (citations: ChatCitation[]) => void;
  onVerification: (verification: ChatVerification) => void;
  onRetry?: (reason: string) => void;
  onDone: (payload: { message_id: string; latency_ms: number }) => void;
  onError: (payload: { code: string; message: string }) => void;
};

const SESSION: ChatSession = { id: "s1", category_code: null, title: null, created_at: "" };
const QUESTION = "예식장 계약금은 얼마인가요?";
const INPUT_LABEL = "메시지를 입력하세요";

const CITATION: ChatCitation = {
  chunk_id: 7,
  title: "예식장 표준약관 해설",
  source_tier: "OFFICIAL",
  source_url: "https://example.test/a",
};
const VERIFICATION: ChatVerification = { verdict: "SUPPORTED", reason: "참고자료로 뒷받침됨" };

const SAVED_ANSWER: ChatMessage = {
  id: "server-m1",
  role: "assistant",
  content: "서버에 저장돼 있던 답변입니다.",
  citations: [CITATION],
  verification: VERIFICATION,
  created_at: "",
};

beforeEach(() => {
  createChatSessionMock.mockReset();
  getChatMessagesMock.mockReset();
  sendChatMessageMock.mockReset();
});

/**
 * 근거 목록이 실제로 붙었는지 본다.
 *
 * `SourceList` 는 접힌 상태에서 「공식 근거 1개」 토글만 내고 제목은 펼쳐야 나온다(D16) —
 * 요약 문구만 보면 "목록 컴포넌트가 그려졌다"까지밖에 확인이 안 되므로 펼쳐서 제목까지 본다.
 */
function expectCitationVisible() {
  const toggle = screen.getByRole("button", { name: /공식 근거 1개/u });
  fireEvent.click(toggle);
  expect(screen.getByText(CITATION.title)).toBeInTheDocument();
}

/** 질문 하나를 보낸다. `stream` 이 핸들러를 받아 이벤트를 흘리거나 붙잡아 둔다. */
async function sendQuestion(stream: (handlers: StreamHandlers) => Promise<void> | void) {
  const user = userEvent.setup();
  sendChatMessageMock.mockImplementation((_s: string, _c: string, received: StreamHandlers) =>
    Promise.resolve(stream(received)),
  );
  render(<ChatPanel sessionId="s1" onSessionCreated={() => {}} />);
  await user.type(screen.getByPlaceholderText(INPUT_LABEL), QUESTION);
  await user.click(screen.getByRole("button", { name: "보내기" }));
}

describe("스트림 꼬리가 한 배치로 도착해도 근거가 붙는다", () => {
  let handlers: StreamHandlers;

  /** ⚠️ 스트림은 **열어 둔 채**로 둔다 — 곧바로 resolve 하면 종료 이벤트 없는 스트림이 되어
      아래 「복구」 describe 의 경로가 함께 도는데, 여기서 보려는 것이 아니다. */
  async function startSend() {
    getChatMessagesMock.mockResolvedValue({ messages: [] });
    await sendQuestion((received) => {
      handlers = received;
      return new Promise<void>(() => {});
    });
  }

  /** 백엔드가 실제로 보내는 모양 — 셋 사이에 await 가 없어 한 청크·한 배치로 도착한다. */
  async function emitTail() {
    await act(async () => {
      handlers.onCitations([CITATION]);
      handlers.onVerification(VERIFICATION);
      handlers.onDone({ message_id: "m1", latency_ms: 10 });
      await Promise.resolve();
    });
  }

  it("보통 답변 — 검증 배지와 출처가 그 자리에서 바로 보인다", async () => {
    await startSend();
    await act(async () => {
      handlers.onToken("계약금은 보통 총액의 10% 입니다.");
      await Promise.resolve();
    });
    await emitTail();

    expect(screen.getByText("답변 근거 확인됨")).toBeInTheDocument();
    expectCitationVisible();
    // 평가 버튼도 같은 게이트를 탄다 — verification 이 유실되면 이것부터 사라진다.
    expect(screen.getByRole("button", { name: "이 답변이 도움됐어요" })).toBeInTheDocument();
  });

  it("재생성(CRAG 재시도)한 답변에도 그대로 붙는다 — 신고된 그 경로다", async () => {
    await startSend();
    await act(async () => {
      handlers.onToken("1차 답변입니다.");
      await Promise.resolve();
    });
    await act(async () => {
      handlers.onRetry?.("근거가 부족합니다");
      await Promise.resolve();
    });
    await act(async () => {
      handlers.onToken("2차 답변입니다.");
      await Promise.resolve();
    });
    await emitTail();

    expect(screen.getByText("2차 답변입니다.")).toBeInTheDocument();
    expect(screen.getByText("답변 근거 확인됨")).toBeInTheDocument();
    expectCitationVisible();
  });

  it("토큰까지 한 배치에 몰려도 답변 본문이 잘리지 않는다", async () => {
    await startSend();
    await act(async () => {
      handlers.onToken("계약금은 ");
      handlers.onToken("보통 총액의 ");
      handlers.onToken("10% 입니다.");
      handlers.onCitations([CITATION]);
      handlers.onVerification(VERIFICATION);
      handlers.onDone({ message_id: "m1", latency_ms: 10 });
      await Promise.resolve();
    });

    expect(screen.getByText("계약금은 보통 총액의 10% 입니다.")).toBeInTheDocument();
    expect(screen.getByText("답변 근거 확인됨")).toBeInTheDocument();
  });
});

// 회귀 ② — docs/architecture/chat-streaming.md §5 가 계약으로 적어 뒀지만 구현이 없던 경로.
//
// 백엔드는 **DB 커밋 뒤에** `done` 을 보낸다. 배포 환경 인그레스의 읽기 타임아웃 60초에 걸리면
// 종료 이벤트 없이 연결이 닫히는데, 그때 답변은 **이미 저장돼 있다.** 종전 `handleSend` 는
// `await sendChatMessage(...)` 뒤에 아무 코드가 없어 ① `sending` 이 true 로 굳어 입력창이 영구히
// 잠기고 ② 저장된 답변이 화면에 못 올라왔다.
describe("종료 이벤트 없이 스트림이 닫혔을 때", () => {
  it("서버에 저장된 답변을 가져와 붙이고 입력창을 다시 연다", async () => {
    getChatMessagesMock.mockResolvedValueOnce({ messages: [] }); // 진입 시 히스토리
    getChatMessagesMock.mockResolvedValueOnce({ messages: [SAVED_ANSWER] }); // 종료 후 화해
    await sendQuestion((h) => h.onToken("답변을 쓰다 말고 끊겼습니다."));

    expect(await screen.findByText("서버에 저장돼 있던 답변입니다.")).toBeInTheDocument();
    expectCitationVisible();
    expect(screen.getByPlaceholderText(INPUT_LABEL)).not.toBeDisabled();
    // 전송 자체는 성공했다(user 메시지는 스트림 시작 전에 커밋된다) — 실패로 찍지 않는다.
    expect(screen.queryByText("전송 실패 · 다시 시도해 주세요")).not.toBeInTheDocument();
  });

  it("서버에도 답변이 없으면 사유를 알리고 입력창을 다시 연다", async () => {
    getChatMessagesMock.mockResolvedValueOnce({ messages: [] });
    getChatMessagesMock.mockResolvedValueOnce({
      messages: [{ id: "u1", role: "user", content: QUESTION, created_at: "" }],
    });
    await sendQuestion(() => {});

    expect(await screen.findByRole("alert")).toHaveTextContent("답변을 받지 못했습니다");
    expect(screen.getByPlaceholderText(INPUT_LABEL)).not.toBeDisabled();
  });

  it("화해 조회마저 실패해도 입력창은 열린다 — 조용히 잠기지 않는다", async () => {
    getChatMessagesMock.mockResolvedValueOnce({ messages: [] });
    getChatMessagesMock.mockRejectedValueOnce(new Error("boom"));
    await sendQuestion(() => {});

    expect(await screen.findByRole("alert")).toHaveTextContent("답변을 받지 못했습니다");
    expect(screen.getByPlaceholderText(INPUT_LABEL)).not.toBeDisabled();
  });

  it("🚨 화해 조회 중에 대화를 갈아타면 그 답변을 남의 화면에 붙이지 않는다", async () => {
    const user = userEvent.setup();
    let resolveReconcile: ((res: { messages: ChatMessage[] }) => void) | undefined;
    getChatMessagesMock
      .mockResolvedValueOnce({ messages: [] }) // A 진입 시 히스토리
      .mockImplementationOnce(
        () =>
          new Promise<{ messages: ChatMessage[] }>((resolve) => {
            resolveReconcile = resolve;
          }),
      )
      .mockResolvedValue({ messages: [] }); // B 진입 시 히스토리
    sendChatMessageMock.mockImplementation(async (_s: string, _c: string, h: StreamHandlers) => {
      h.onToken("A 대화에서 쓰다 만 답변");
    });

    const { rerender } = render(<ChatPanel sessionId="A" onSessionCreated={() => {}} />);
    await user.type(screen.getByPlaceholderText(INPUT_LABEL), QUESTION);
    await user.click(screen.getByRole("button", { name: "보내기" }));

    // 화해 조회가 도는 동안 B 로 갈아탄다.
    rerender(<ChatPanel sessionId="B" onSessionCreated={() => {}} />);
    await act(async () => {
      // 화해 조회가 실제로 시작됐어야 이 테스트가 의미를 갖는다.
      expect(resolveReconcile).toBeDefined();
      resolveReconcile?.({ messages: [SAVED_ANSWER] });
      await Promise.resolve();
    });

    expect(screen.queryByText("서버에 저장돼 있던 답변입니다.")).not.toBeInTheDocument();
    // 사유 배너도 A 대화의 것이다 — B 화면에 남기지 않는다.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("무엇이 궁금하세요?")).toBeInTheDocument();
  });
});

// 회귀 ③ — 백엔드 `_finish_after_upstream_failure` 는 이미 스트리밍된 답변을 **DB에 커밋한 뒤**
// citations→verification→error 를 보낸다. 종전 `onError` 는 draft 를 버리고 말풍선을 「전송
// 실패」로 찍어서, 서버에 남아 있는 답변과 화면이 갈렸다(회귀 ①과 같은 계열이다).
describe("event: error 인데 답변은 저장된 경우", () => {
  it("사유는 알리되 답변은 서버에서 가져와 살린다", async () => {
    getChatMessagesMock.mockResolvedValueOnce({ messages: [] });
    getChatMessagesMock.mockResolvedValueOnce({ messages: [SAVED_ANSWER] });
    await sendQuestion((h) => {
      h.onToken("답변을 쓰던 중이었습니다.");
      h.onError({ code: "UPSTREAM_LLM_ERROR", message: "일시적인 오류로 답변을 완성하지 못했습니다." });
    });

    expect(await screen.findByText("서버에 저장돼 있던 답변입니다.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("일시적인 오류");
    expect(screen.queryByText("전송 실패 · 다시 시도해 주세요")).not.toBeInTheDocument();
  });

  it("답변이 시작도 못 했으면 종전대로 전송 실패로 표시한다 — 헛된 재조회도 하지 않는다", async () => {
    getChatMessagesMock.mockResolvedValueOnce({ messages: [] });
    await sendQuestion((h) => {
      h.onError({ code: "RATE_LIMITED", message: "지금 요청이 많아 답변 생성이 지연되고 있습니다." });
    });

    expect(await screen.findByText("전송 실패 · 다시 시도해 주세요")).toBeInTheDocument();
    expect(getChatMessagesMock).toHaveBeenCalledTimes(1); // 진입 시 히스토리 1회뿐
  });
});

// 회귀 ④ — 세션을 만드는 동안 사용자가 「지난 대화」에서 다른 대화를 열면, 뒤늦게 도착한
// createChatSession 응답이 `onSessionCreated` 로 **사용자가 고르지 않은 세션에 화면을 되돌렸다.**
// 게다가 skipNextHistoryFetch 가 서 있어 그 대화의 히스토리 복원까지 건너뛴다.
describe("세션 생성 중 대화를 갈아탄 경우", () => {
  it("뒤늦게 도착한 새 세션으로 화면을 되돌리지 않는다", async () => {
    const user = userEvent.setup();
    const onSessionCreated = vi.fn();
    getChatMessagesMock.mockResolvedValue({ messages: [] });
    // 세션 생성을 **응답 대기 상태로 붙잡아 둔다** — 그 사이에 대화를 갈아타는 것이 이 경합이다.
    let resolveCreate: ((session: ChatSession) => void) | undefined;
    createChatSessionMock.mockImplementation(
      () =>
        new Promise<ChatSession>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    sendChatMessageMock.mockImplementation(() => new Promise(() => {}));

    function SwitchHarness() {
      const [sessionId, setSessionId] = useState<string | null>(null);
      return (
        <>
          <button type="button" onClick={() => setSessionId("other")}>
            지난 대화 열기
          </button>
          <ChatPanel sessionId={sessionId} onSessionCreated={onSessionCreated} />
        </>
      );
    }

    render(<SwitchHarness />);
    await user.type(screen.getByPlaceholderText(INPUT_LABEL), QUESTION);
    await user.click(screen.getByRole("button", { name: "보내기" }));
    await user.click(screen.getByRole("button", { name: "지난 대화 열기" }));

    await act(async () => {
      resolveCreate?.(SESSION);
      await Promise.resolve();
    });

    expect(onSessionCreated).not.toHaveBeenCalled();
    // 이 세션으로는 메시지도 보내지 않는다 — 사용자가 보고 있지 않은 대화다.
    expect(sendChatMessageMock).not.toHaveBeenCalled();
  });
});
