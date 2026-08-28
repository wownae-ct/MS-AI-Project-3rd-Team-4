// "AI 다시 생성"은 되돌릴 수 없는 삭제다(backend/app/services/personalization.py::
// _delete_unprotected_items) — 이 파일이 고정하는 계약은 "확인 없이는 절대 호출되지 않는다"와
// "무엇이 남고 무엇이 사라지는지 사전에 말한다" 둘이다. 2026-08-29 이전엔 클릭 한 번이 곧바로
// 삭제였고, 그 회귀를 잡는 테스트가 없었다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegenerateButton } from "./RegenerateButton";

const regenerateMock = vi.fn();
vi.mock("../api/personalization", () => ({
  regeneratePersonalization: (domains: string[]) => regenerateMock(domains),
}));

beforeEach(() => {
  regenerateMock.mockReset();
  regenerateMock.mockResolvedValue({ ai_invocation_id: "inv-1", status: "SUCCESS", affected_domains: ["TIMELINE"] });
});

function renderTimelineButton(impact?: { keptCount: number; resetCount: number }) {
  const onRegenerated = vi.fn();
  render(
    <RegenerateButton domain="TIMELINE" label="AI 타임라인 다시 생성" impact={impact} onRegenerated={onRegenerated} />,
  );
  return { onRegenerated, user: userEvent.setup() };
}

describe("RegenerateButton — 초기화 경고", () => {
  it("버튼을 눌러도 곧바로 재생성하지 않고 확인부터 받는다", async () => {
    const { user } = renderTimelineButton({ keptCount: 3, resetCount: 12 });

    await user.click(screen.getByRole("button", { name: "AI 타임라인 다시 생성" }));

    expect(regenerateMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("유지되는 것과 초기화되는 것을 개수까지 알린다", async () => {
    const { user } = renderTimelineButton({ keptCount: 3, resetCount: 12 });

    await user.click(screen.getByRole("button", { name: "AI 타임라인 다시 생성" }));
    const dialog = await screen.findByRole("alertdialog");

    expect(dialog).toHaveTextContent("체크하거나 날짜를 바꾼 3개만 남아요.");
    expect(dialog).toHaveTextContent("나머지 12개는 직접 추가한 것까지 지워져요. 되돌릴 수 없어요.");
  });

  it("초기 포커스가 취소에 있다 — Enter 연타가 그대로 실행으로 이어지지 않는다", async () => {
    const { user } = renderTimelineButton();

    await user.click(screen.getByRole("button", { name: "AI 타임라인 다시 생성" }));
    await screen.findByRole("alertdialog");

    expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
  });

  it("취소하면 아무 일도 일어나지 않는다", async () => {
    const { onRegenerated, user } = renderTimelineButton();

    await user.click(screen.getByRole("button", { name: "AI 타임라인 다시 생성" }));
    await user.click(await screen.findByRole("button", { name: "취소" }));

    expect(regenerateMock).not.toHaveBeenCalled();
    expect(onRegenerated).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("Esc 로도 취소된다", async () => {
    const { user } = renderTimelineButton();

    await user.click(screen.getByRole("button", { name: "AI 타임라인 다시 생성" }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");

    expect(regenerateMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("확인하면 한 번만 재생성한다", async () => {
    const { onRegenerated, user } = renderTimelineButton({ keptCount: 3, resetCount: 12 });

    await user.click(screen.getByRole("button", { name: "AI 타임라인 다시 생성" }));
    await user.click(await screen.findByRole("button", { name: "다시 생성" }));

    expect(regenerateMock).toHaveBeenCalledTimes(1);
    expect(regenerateMock).toHaveBeenCalledWith(["TIMELINE"]);
    expect(onRegenerated).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("다시 생성했어요.")).toBeInTheDocument();
  });

  it("개수를 모르는 화면에서는 개수 없이 같은 사실을 알린다", async () => {
    render(<RegenerateButton domain="CHECKLIST" label="AI 체크리스트 다시 생성" onRegenerated={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "AI 체크리스트 다시 생성" }));
    const dialog = await screen.findByRole("alertdialog");

    expect(dialog).toHaveTextContent("상태를 바꾸거나 메모한 항목만 남아요.");
    expect(dialog).toHaveTextContent("나머지는 직접 추가한 것까지 지워져요. 되돌릴 수 없어요.");
    // 탭은 한 카테고리만 보여 주지만 재생성은 웨딩 전체가 대상이다.
    expect(dialog).toHaveTextContent("모든 카테고리가 함께 바뀌어요.");
  });

  it("실패하면 확인창을 닫고 오류를 알린다 — 성공한 것처럼 보이지 않게", async () => {
    regenerateMock.mockRejectedValue(new Error("boom"));
    const { onRegenerated, user } = renderTimelineButton();

    await user.click(screen.getByRole("button", { name: "AI 타임라인 다시 생성" }));
    await user.click(await screen.findByRole("button", { name: "다시 생성" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("다시 생성하지 못했습니다.");
    expect(onRegenerated).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
