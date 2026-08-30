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
const deleteChatSessionMock = vi.fn();

// `ChatPanel` 은 여기서 검증 대상이 아니다 — 받은 sessionId 를 그대로 드러내는 자리표시자로
// 바꿔서, 이 화면이 **무엇을 내려보내는지**만 본다.
vi.mock("@/entities/chat", () => ({
  listChatSessions: () => listChatSessionsMock(),
  deleteChatSession: (id: string) => deleteChatSessionMock(id),
  ChatPanel: ({ sessionId }: { sessionId: string | null }) => <div>panel:{sessionId ?? "none"}</div>,
}));
vi.mock("@/entities/feedback", () => ({ ReportButton: () => null }));

beforeEach(() => {
  listChatSessionsMock.mockReset();
  deleteChatSessionMock.mockReset();
  sessionStorage.clear();
});

function sessionRow(id: string, title: string) {
  return { id, category_code: null, title, last_message_at: "2026-08-29T05:00:00Z", created_at: "2026-08-29T00:00:00Z" };
}

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
    // `^` 를 앵커한다 — 같은 행의 삭제 버튼 접근명이 「예식장 질문」 삭제 라서(2026-08-30) 앵커가
    // 없으면 이 조회가 버튼 2개를 물어 실패한다. 두 이름이 겹치는 것 자체는 의도다: 스크린리더가
    // 「무엇의 삭제인지」를 알아야 한다.
    await user.click(await screen.findByRole("button", { name: /^예식장 질문/u }));

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

  // 위 머리말의 「미러를 갱신해야 하는 지점」이 **넷**이 됐다(2026-08-30) — 삭제가 넷째다.
  // 이 배선이 빠지면 지운 대화가 화면에 그대로 남고 다음 전송이 404 로 죽는다.
  it("지금 열려 있는 대화를 지우면 화면을 비우고 미러도 지운다", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(STORAGE_KEY, "open-one");
    listChatSessionsMock.mockResolvedValue({ sessions: [sessionRow("open-one", "지금 보는 대화")] });
    deleteChatSessionMock.mockImplementation(() => Promise.resolve());

    render(<ChatPage />);
    expect(screen.getByText("panel:open-one")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "지난 대화" }));
    await user.click(await screen.findByRole("button", { name: "「지금 보는 대화」 삭제" }));
    await user.click(screen.getByRole("button", { name: "삭제" }));

    expect(await screen.findByText("panel:none")).toBeInTheDocument();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("다른 대화를 지우면 지금 보던 대화는 그대로 남는다", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(STORAGE_KEY, "open-one");
    listChatSessionsMock.mockResolvedValue({
      sessions: [sessionRow("open-one", "지금 보는 대화"), sessionRow("other", "다른 대화")],
    });
    deleteChatSessionMock.mockImplementation(() => Promise.resolve());

    render(<ChatPage />);

    await user.click(screen.getByRole("button", { name: "지난 대화" }));
    await user.click(await screen.findByRole("button", { name: "「다른 대화」 삭제" }));
    await user.click(screen.getByRole("button", { name: "삭제" }));

    // 목록 정리를 했더니 읽던 대화가 사라지면 안 된다.
    expect(await screen.findByText("panel:open-one")).toBeInTheDocument();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("open-one");
  });
});

// 헤더 버튼의 터치 타겟 계약 — docs/design/a11y.md §1.5 의 44px 은 이 저장소가 세 근거의 수렴으로
// 못박은 값이고, 이 버튼은 그 계약을 `shared/ui/Button` 밖에서 지키는 유일한 자리다.
//
// **왜 클래스 문자열을 단언하는가.** 이 저장소가 일반적으로 하지 않는 일이지만(구현 세부에 테스트를
// 묶는다), 여기서는 그것이 정확히 필요한 것이다 — jsdom 은 레이아웃을 계산하지 않아 「이 버튼의
// 히트 영역이 44px 인가」를 실제 크기로 물을 수단이 없고, 짝이 깨져도 **화면에는 아무 변화가 없다**
// (36px 상자는 그대로 보인다). `shared/ui/Button.test.tsx` 의 `sm` 계약, `Badge.test.tsx` 의 D16 짝이
// 같은 이유로 같은 방식을 쓴다.
describe("AI상담 헤더 — 지난 대화 버튼", () => {
  it("36px 상자와 44px 히트 영역을 **함께** 갖는다", () => {
    listChatSessionsMock.mockResolvedValue({ sessions: [] });
    render(<ChatPage />);

    // 아이콘만 보이는 버튼이라 접근명은 `aria-label` 뿐이다 — 이 쿼리가 그 사실도 함께 고정한다.
    const button = screen.getByRole("button", { name: "지난 대화" });
    // 보이는 상자 36×36
    expect(button.className).toContain("h-9");
    expect(button.className).toContain("w-9");
    // 사방 4px 씩 넘치는 의사요소 — 이 셋이 함께 있어야 44×44 가 된다.
    // `Button` 의 `sm`(`after:-inset-y-1`)과 달리 **가로도** 되살려야 한다: 폭이 높이와 같아졌다.
    expect(button.className).toContain("relative");
    expect(button.className).toContain("after:absolute");
    expect(button.className).toContain("after:-inset-1");
  });

  it("아이콘 색은 하단 탭바와 같은 토큰을 쓴다", () => {
    listChatSessionsMock.mockResolvedValue({ sessions: [] });
    render(<ChatPage />);

    // `text-ink` 로 되돌아가면 헤더 아이콘만 탭바보다 검고 무거워진다(사용자 리포트 2026-08-29).
    // 색 토큰은 app/ui/NavItem.tsx 의 `BASE` 와 같은 값이어야 한다.
    const button = screen.getByRole("button", { name: "지난 대화" });
    expect(button.className).toContain("text-ink-soft");
  });
});
