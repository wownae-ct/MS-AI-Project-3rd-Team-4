// 지난 대화 목록 드로어 (레드팀 감사 #17).
//
// `<dialog>` 의 모달 동작(포커스 트랩·top layer·배경 inert)은 **검증하지 않는다** — 그건
// 브라우저 몫이고, `src/setupTests.ts` 가 흉내 낸 것은 열림 상태 토글뿐이다. 그 스텁을
// 테스트하면 테스트가 브라우저가 아니라 스텁을 검증하게 된다(그 파일 머리말의 경고).
// 여기서 고정하는 것은 **이 컴포넌트가 스스로 결정하는 것들**이다: 언제 조회하는지, 무엇을
// 거르는지, 무엇을 부르는지, 실패했을 때 무엇을 보여주는지.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatSessionSummary } from "@/entities/chat";
import { ChatHistoryDrawer } from "./ChatHistoryDrawer";

const listChatSessionsMock = vi.fn();

vi.mock("@/entities/chat", () => ({
  listChatSessions: () => listChatSessionsMock(),
}));

function session(over: Partial<ChatSessionSummary> & { id: string }): ChatSessionSummary {
  return {
    category_code: null,
    title: null,
    last_message_at: null,
    created_at: "2026-08-29T00:00:00Z",
    ...over,
  };
}

const WITH_CONTENT = session({
  id: "s1",
  title: "예식장 견적 비교는 어떻게 하나요?",
  last_message_at: "2026-08-29T05:00:00Z",
});
// 첫 메시지 전송이 실패해 서버에 남은 빈 세션 — 열어 봐야 빈 화면이라 목록에 낼 이유가 없다.
const EMPTY = session({ id: "s2" });

function renderDrawer(over: Partial<Parameters<typeof ChatHistoryDrawer>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    currentSessionId: null,
    onSelect: vi.fn(),
    onNewSession: vi.fn(),
    ...over,
  };
  render(<ChatHistoryDrawer {...props} />);
  return props;
}

beforeEach(() => {
  listChatSessionsMock.mockReset();
});

describe("지난 대화 목록", () => {
  it("열면 목록을 조회해 제목을 보여주고, 메시지가 없는 빈 세션은 뺀다", async () => {
    listChatSessionsMock.mockResolvedValue({ sessions: [WITH_CONTENT, EMPTY] });

    renderDrawer();

    expect(await screen.findByText("예식장 견적 비교는 어떻게 하나요?")).toBeInTheDocument();
    expect(screen.queryByText("새 대화")).not.toBeInTheDocument();
  });

  it("닫혀 있으면 조회하지 않는다", () => {
    listChatSessionsMock.mockResolvedValue({ sessions: [] });

    renderDrawer({ open: false });

    // 탭에 들어오기만 하고 목록을 안 여는 사용자에게 불필요한 요청을 보내지 않는다.
    expect(listChatSessionsMock).not.toHaveBeenCalled();
  });

  it("항목을 고르면 그 세션 id로 onSelect를 부르고, 지금 보고 있는 대화엔 aria-current가 붙는다", async () => {
    const user = userEvent.setup();
    listChatSessionsMock.mockResolvedValue({ sessions: [WITH_CONTENT] });

    const props = renderDrawer({ currentSessionId: "s1" });

    const row = await screen.findByRole("button", { name: /예식장 견적 비교는 어떻게 하나요/u });
    expect(row).toHaveAttribute("aria-current", "true");

    await user.click(row);
    expect(props.onSelect).toHaveBeenCalledWith("s1");
  });

  it("대화가 하나도 없으면 그렇다고 말한다", async () => {
    listChatSessionsMock.mockResolvedValue({ sessions: [] });

    renderDrawer();

    expect(await screen.findByText("아직 나눈 대화가 없어요.")).toBeInTheDocument();
  });

  it("새 대화 시작하기를 누르면 onNewSession을 부른다", async () => {
    const user = userEvent.setup();
    listChatSessionsMock.mockResolvedValue({ sessions: [WITH_CONTENT] });

    const props = renderDrawer();

    await user.click(screen.getByRole("button", { name: "새 대화 시작하기" }));
    expect(props.onNewSession).toHaveBeenCalled();
  });

  it("조회에 실패하면 조용히 빈 목록으로 두지 않고 알리고, 다시 시도로 복구된다", async () => {
    const user = userEvent.setup();
    // "목록이 비어 있다"와 "못 불러왔다"는 사용자에게 전혀 다른 사실이다.
    listChatSessionsMock.mockRejectedValueOnce(new Error("boom"));

    renderDrawer();

    expect(await screen.findByRole("alert")).toHaveTextContent("대화 목록을 불러오지 못했습니다.");
    expect(screen.queryByText("아직 나눈 대화가 없어요.")).not.toBeInTheDocument();

    listChatSessionsMock.mockResolvedValue({ sessions: [WITH_CONTENT] });
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("예식장 견적 비교는 어떻게 하나요?")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("닫기를 누르면 onOpenChange(false)를 부른다", async () => {
    const user = userEvent.setup();
    listChatSessionsMock.mockResolvedValue({ sessions: [] });

    const props = renderDrawer();

    await user.click(screen.getByRole("button", { name: "닫기" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });
});
