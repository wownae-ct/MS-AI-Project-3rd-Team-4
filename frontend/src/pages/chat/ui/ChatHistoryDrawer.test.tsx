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
import { ApiError } from "@/shared/api";
import type { ChatSessionSummary } from "@/entities/chat";
import { ChatHistoryDrawer } from "./ChatHistoryDrawer";

const listChatSessionsMock = vi.fn();
const deleteChatSessionMock = vi.fn();

vi.mock("@/entities/chat", () => ({
  listChatSessions: () => listChatSessionsMock(),
  deleteChatSession: (id: string) => deleteChatSessionMock(id),
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
    onDeleted: vi.fn(),
    ...over,
  };
  render(<ChatHistoryDrawer {...props} />);
  return props;
}

beforeEach(() => {
  listChatSessionsMock.mockReset();
  deleteChatSessionMock.mockReset();
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

    // `^` 앵커 — 같은 행의 삭제 버튼 접근명이 「…」 삭제 라 앵커가 없으면 2개가 잡힌다(2026-08-30).
    const row = await screen.findByRole("button", { name: /^예식장 견적 비교는 어떻게 하나요/u });
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

// 대화 삭제 (사용자 요청 2026-08-30).
//
// 되돌릴 수 없는 행동이라 **한 번의 탭으로 지워지지 않는다**는 것이 첫 계약이고, 실패를 조용히
// 삼키지 않는다는 것이 둘째다(이 저장소 관례 — 위 「조회에 실패하면」 테스트와 같은 원칙).
describe("지난 대화 삭제", () => {
  const TITLE = "예식장 견적 비교는 어떻게 하나요?";

  async function openWithOneSession() {
    const user = userEvent.setup();
    listChatSessionsMock.mockResolvedValue({ sessions: [WITH_CONTENT] });
    const props = renderDrawer({ currentSessionId: "s1" });
    await screen.findByText(TITLE);
    return { user, props };
  }

  it("삭제를 누르면 곧바로 지우지 않고 되묻는다", async () => {
    const { user } = await openWithOneSession();

    await user.click(screen.getByRole("button", { name: `「${TITLE}」 삭제` }));

    expect(screen.getByRole("alert")).toHaveTextContent(`「${TITLE}」 삭제할까요?`);
    // 되묻는 단계에서는 서버를 건드리지 않는다 — 이게 이 단계의 존재 이유 전부다.
    expect(deleteChatSessionMock).not.toHaveBeenCalled();
  });

  it("취소하면 원래 행으로 돌아오고 아무것도 지워지지 않는다", async () => {
    const { user, props } = await openWithOneSession();

    await user.click(screen.getByRole("button", { name: `「${TITLE}」 삭제` }));
    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.getByRole("button", { name: new RegExp(`^${TITLE}`, "u") })).toBeInTheDocument();
    expect(deleteChatSessionMock).not.toHaveBeenCalled();
    expect(props.onDeleted).not.toHaveBeenCalled();
  });

  it("확정하면 그 세션을 지우고 목록에서 빼고 onDeleted로 알린다", async () => {
    const { user, props } = await openWithOneSession();
    deleteChatSessionMock.mockImplementation(() => Promise.resolve());

    await user.click(screen.getByRole("button", { name: `「${TITLE}」 삭제` }));
    await user.click(screen.getByRole("button", { name: "삭제" }));

    expect(deleteChatSessionMock).toHaveBeenCalledWith("s1");
    expect(await screen.findByText("아직 나눈 대화가 없어요.")).toBeInTheDocument();
    // 부모가 이 신호를 받아야 「지금 열려 있던 대화를 지운 경우」를 처리할 수 있다.
    expect(props.onDeleted).toHaveBeenCalledWith("s1");
    // 목록 안에서 끝나는 행동이라 드로어는 닫지 않는다 — 연속 삭제가 자연스럽다.
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("실패하면 행이 남고 사유를 알린다", async () => {
    const { user, props } = await openWithOneSession();
    deleteChatSessionMock.mockRejectedValue(
      new ApiError({ code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다.", status: 500, extra: {} }),
    );

    await user.click(screen.getByRole("button", { name: `「${TITLE}」 삭제` }));
    await user.click(screen.getByRole("button", { name: "삭제" }));

    expect(await screen.findByText("서버 오류가 발생했습니다.")).toBeInTheDocument();
    // 지워진 척하지 않는다 — 되묻는 상태 그대로 남아 다시 시도할 수 있다.
    expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
    expect(props.onDeleted).not.toHaveBeenCalled();
  });

  it("서버에 이미 없는 대화는 성공과 같이 처리한다", async () => {
    const { user, props } = await openWithOneSession();
    // 다른 기기·다른 탭에서 이미 지웠다 — 사용자가 원한 결과는 이뤄져 있으므로 에러를 띄우면
    // 「지워졌는데 실패했다고 한다」가 된다.
    deleteChatSessionMock.mockRejectedValue(
      new ApiError({ code: "CHAT_SESSION_NOT_FOUND", message: "상담 세션을 찾을 수 없습니다.", status: 404, extra: {} }),
    );

    await user.click(screen.getByRole("button", { name: `「${TITLE}」 삭제` }));
    await user.click(screen.getByRole("button", { name: "삭제" }));

    expect(await screen.findByText("아직 나눈 대화가 없어요.")).toBeInTheDocument();
    expect(props.onDeleted).toHaveBeenCalledWith("s1");
  });
});
