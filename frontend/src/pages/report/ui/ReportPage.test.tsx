// 리포트 화면 검증. 지금은 서버 연동 전이라 표시할 데이터가 없다 —
// 그 사실을 화면이 말하는지, 그리고 재시작 경로가 살아 있는지를 고정한다.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReportPage } from "./ReportPage";

describe("ReportPage", () => {
  it("제목을 보여준다", () => {
    render(<ReportPage onRestart={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "세션 히스토리" })).toBeInTheDocument();
  });

  it("서버 연동 전이라는 사실을 안내한다 — 빈 화면으로 두지 않는다", () => {
    render(<ReportPage onRestart={vi.fn()} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/서버 연동 후 제공됩니다/u)).toBeInTheDocument();
  });

  it("새 연습 시작을 누르면 onRestart를 호출한다", () => {
    const onRestart = vi.fn();
    render(<ReportPage onRestart={onRestart} />);
    fireEvent.click(screen.getByRole("button", { name: "새 연습 시작" }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});
