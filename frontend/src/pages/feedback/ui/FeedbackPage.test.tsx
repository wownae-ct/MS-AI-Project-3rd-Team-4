// 피드백 화면 검증. 이 화면의 1급 요구는 "서버 연동 전에도 빈 화면이 아니어야 한다"와
// "근거검증 강등을 조용히 넘기지 않는다"이다 — 둘 다 조용한 실패를 막는 장치다.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CoachFeedback } from "@/entities/coach-feedback";
import type { AnswerMetrics } from "@/entities/answer";
import { FeedbackPage } from "./FeedbackPage";

const FEEDBACK: CoachFeedback = {
  answerId: "a-1",
  structureScore: { opening: 0.8, star: 0.6, conciseness: 0.75 },
  feedbackText: "두괄식으로 시작한 점이 좋았습니다.",
  rewriteExample: "결론부터 말하면 …",
  guardrailVerdict: "pass",
};

const METRICS: AnswerMetrics = { fillerWordCount: 3, wpm: 128.4, sentenceCount: 9, silenceMs: 1200 };

describe("피드백 대기 상태", () => {
  it("feedback이 없으면 대기 안내를 보여준다 — 빈 화면이 아니다", () => {
    render(<FeedbackPage feedback={null} metrics={null} onNext={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "즉시 피드백" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("대기 중에는 점수 영역을 그리지 않는다", () => {
    render(<FeedbackPage feedback={null} metrics={null} onNext={vi.fn()} />);
    expect(screen.queryByLabelText("구조 점수")).not.toBeInTheDocument();
  });
});

describe("피드백 표시", () => {
  it("구조 점수 3종을 백분율로 보여준다", () => {
    render(<FeedbackPage feedback={FEEDBACK} metrics={null} onNext={vi.fn()} />);
    const scores = screen.getByLabelText("구조 점수");
    expect(scores).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByText("75")).toBeInTheDocument();
  });

  it("코칭 코멘트와 리라이트 예시를 보여준다", () => {
    render(<FeedbackPage feedback={FEEDBACK} metrics={null} onNext={vi.fn()} />);
    expect(screen.getByText(FEEDBACK.feedbackText)).toBeInTheDocument();
    expect(screen.getByText("리라이트 예시")).toBeInTheDocument();
  });

  it("리라이트 예시가 없으면 그 블록을 그리지 않는다", () => {
    render(<FeedbackPage feedback={{ ...FEEDBACK, rewriteExample: null }} metrics={null} onNext={vi.fn()} />);
    expect(screen.queryByText("리라이트 예시")).not.toBeInTheDocument();
  });

  it("근거검증 강등(degraded)을 배너로 드러낸다 — 조용히 넘기지 않는다", () => {
    render(<FeedbackPage feedback={{ ...FEEDBACK, guardrailVerdict: "degraded" }} metrics={null} onNext={vi.fn()} />);
    expect(screen.getByText(/근거검증에 실패/u)).toBeInTheDocument();
  });

  it("pass 판정에서는 강등 배너가 없다", () => {
    render(<FeedbackPage feedback={FEEDBACK} metrics={null} onNext={vi.fn()} />);
    expect(screen.queryByText(/근거검증에 실패/u)).not.toBeInTheDocument();
  });
});

describe("음성 지표", () => {
  it("metrics가 있으면 필러워드와 wpm을 보여준다(wpm은 반올림)", () => {
    render(<FeedbackPage feedback={FEEDBACK} metrics={METRICS} onNext={vi.fn()} />);
    expect(screen.getByLabelText("음성 지표")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
  });

  it("metrics가 없으면 지표 영역을 그리지 않는다", () => {
    render(<FeedbackPage feedback={FEEDBACK} metrics={null} onNext={vi.fn()} />);
    expect(screen.queryByLabelText("음성 지표")).not.toBeInTheDocument();
  });
});

describe("다음 단계", () => {
  it("버튼을 누르면 onNext를 호출한다", () => {
    const onNext = vi.fn();
    render(<FeedbackPage feedback={FEEDBACK} metrics={null} onNext={onNext} />);
    fireEvent.click(screen.getByRole("button", { name: "세션 히스토리 보기" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
