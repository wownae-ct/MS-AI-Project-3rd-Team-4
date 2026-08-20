// 연습 세션 화면 검증. 1급 요구는 **실패를 조용히 넘기지 않는 것**이다 —
// 오디오 차단과 Wake Lock 강등은 각각 배너로 드러나야 하고, 카테고리 미선택 시 녹음이 막혀야 한다.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { QuestionCategory } from "@/entities/question";
import type { RecordingState } from "@/entities/practice-session";
import type { AudioUnlockState, WakeLockState } from "@/shared/lib";
import { PracticeSessionPage } from "./PracticeSessionPage";

type Props = Parameters<typeof PracticeSessionPage>[0];

function renderPage(overrides: Partial<Props> = {}) {
  const props: Props = {
    category: null,
    onSelectCategory: vi.fn(),
    audioState: "locked" as AudioUnlockState,
    wakeLockState: "inactive" as WakeLockState,
    recordingState: "idle" as RecordingState,
    onStartGesture: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  render(<PracticeSessionPage {...props} />);
  return props;
}

describe("카테고리 선택", () => {
  it("선택 전에는 녹음 시작이 비활성이다", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "녹음 시작" })).toBeDisabled();
  });

  it("선택 후에는 녹음 시작이 활성이다", () => {
    renderPage({ category: "tech_interview" });
    expect(screen.getByRole("button", { name: "녹음 시작" })).toBeEnabled();
  });

  it("선택한 카테고리를 aria-pressed로 알린다", () => {
    renderPage({ category: "customer_explain" });
    expect(screen.getByRole("button", { name: "고객 설명" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "기술면접" })).toHaveAttribute("aria-pressed", "false");
  });

  it("카테고리를 누르면 그 값으로 콜백한다", () => {
    const props = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "장애 보고" }));
    expect(props.onSelectCategory).toHaveBeenCalledWith<[QuestionCategory]>("incident_report");
  });
});

describe("실패를 드러내는 배너", () => {
  it("오디오가 차단되면 danger 배너로 알린다", () => {
    renderPage({ audioState: "blocked" });
    expect(screen.getByRole("alert")).toHaveTextContent(/마이크를 켤 수 없어/u);
  });

  it("오디오가 정상이면 차단 배너가 없다", () => {
    renderPage({ audioState: "running" });
    expect(screen.queryByText(/마이크를 켤 수 없어/u)).not.toBeInTheDocument();
  });

  it.each<WakeLockState>(["failed", "released-auto", "unsupported"])(
    "Wake Lock 강등(%s)을 배너로 알린다 — 조용히 넘기지 않는다",
    (wakeLockState) => {
      renderPage({ wakeLockState });
      expect(screen.getByText(/화면 켜짐 유지가 동작하지 않아/u)).toBeInTheDocument();
    },
  );

  it("Wake Lock이 정상이면 강등 배너가 없다", () => {
    renderPage({ wakeLockState: "active" });
    expect(screen.queryByText(/화면 켜짐 유지가 동작하지 않아/u)).not.toBeInTheDocument();
  });

  it("서버 연동 전 임시 항목임을 항상 알린다", () => {
    renderPage();
    expect(screen.getByText(/질문 목록은 서버 연동 전 임시 항목입니다/u)).toBeInTheDocument();
  });
});

describe("녹음 제어", () => {
  it("idle에서는 시작 버튼이 보이고 제출 버튼은 없다", () => {
    renderPage({ category: "tech_interview" });
    expect(screen.getByRole("button", { name: "녹음 시작" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "녹음 종료 및 제출" })).not.toBeInTheDocument();
  });

  it("recording에서는 제출 버튼으로 바뀐다", () => {
    renderPage({ category: "tech_interview", recordingState: "recording" });
    expect(screen.getByRole("button", { name: "녹음 종료 및 제출" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "녹음 시작" })).not.toBeInTheDocument();
  });

  it("시작 버튼은 제스처 핸들러를 호출한다", () => {
    const props = renderPage({ category: "tech_interview" });
    fireEvent.click(screen.getByRole("button", { name: "녹음 시작" }));
    expect(props.onStartGesture).toHaveBeenCalledTimes(1);
  });

  it("제출 버튼은 onSubmit을 호출한다", () => {
    const props = renderPage({ category: "tech_interview", recordingState: "recording" });
    fireEvent.click(screen.getByRole("button", { name: "녹음 종료 및 제출" }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });
});
