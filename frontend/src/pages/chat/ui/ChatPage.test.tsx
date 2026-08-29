// AI상담 화면의 세션 배선 — 드로어에서 고른 대화가 실제로 `ChatPanel` 과 sessionStorage 양쪽에
// 반영되는지(레드팀 감사 #17).
//
// 이 화면이 sessionStorage 를 쓰는 이유는 하단 탭 이동이 페이지를 **언마운트**하기 때문이다
// (ChatPage.tsx 머리말 — 예전엔 전송 중 탭을 옮기면 서버의 세션이 영구히 고아가 됐다).
// 목록이 생기면서 그 미러를 갱신해야 하는 지점이 **셋**으로 늘었다: 세션 생성 · 목록에서 선택 ·
// 새 대화. 셋 중 하나라도 빠지면 탭을 다시 열었을 때 엉뚱한 대화가 복원된다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPage } from "./ChatPage";

const STORAGE_KEY = "merrymap.chat.global_session_id";
const listChatSessionsMock = vi.fn();

// `ChatPanel` 은 여기서 검증 대상이 아니다 — 받은 sessionId 를 그대로 드러내는 자리표시자로
// 바꿔서, 이 화면이 **무엇을 내려보내는지**만 본다.
vi.mock("@/entities/chat", () => ({
  listChatSessions: () => listChatSessionsMock(),
  ChatPanel: ({ sessionId }: { sessionId: string | null }) => <div>panel:{sessionId ?? "none"}</div>,
}));
vi.mock("@/entities/feedback", () => ({ ReportButton: () => null }));

beforeEach(() => {
  listChatSessionsMock.mockReset();
  sessionStorage.clear();
});

describe("AI상담 세션 배선", () => {
  it("목록에서 대화를 고르면 그 세션을 열고 sessionStorage 미러도 갱신한다", async () => {
    const user = userEvent.setup();
    listChatSessionsMock.mockResolvedValue({
      sessions: [
        {
          id: "picked",
          category_code: null,
          title: "예식장 질문",
          last_message_at: "2026-08-29T05:00:00Z",
          created_at: "2026-08-29T00:00:00Z",
        },
      ],
    });

    render(<ChatPage />);
    expect(screen.getByText("panel:none")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "지난 대화" }));
    await user.click(await screen.findByRole("button", { name: /예식장 질문/u }));

    expect(screen.getByText("panel:picked")).toBeInTheDocument();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("picked");
  });

  it("새 대화를 시작하면 세션을 비우고 미러도 지운다", async () => {
    const user = userEvent.setup();
    // 이미 이어가던 대화가 있는 상태로 진입 — 이 화면의 기존 동작(브라우저 탭 세션 복원)이다.
    sessionStorage.setItem(STORAGE_KEY, "previous");
    listChatSessionsMock.mockResolvedValue({ sessions: [] });

    render(<ChatPage />);
    expect(screen.getByText("panel:previous")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "지난 대화" }));
    await user.click(await screen.findByRole("button", { name: "새 대화 시작하기" }));

    expect(screen.getByText("panel:none")).toBeInTheDocument();
    // 지우지 않으면 탭을 다시 열 때 방금 버린 대화가 되살아난다.
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
