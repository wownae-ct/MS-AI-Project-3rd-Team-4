// app 조립 검증 — 페이즈 전환·진입 가드 분기·오디오 차단 시 녹음 시작 불가.
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

describe("App 조립", () => {
  it("정상 진입 → 연습 세션 화면", () => {
    render(<App guardVerdict={{ kind: "ok" }} />);
    expect(screen.getByRole("heading", { name: "연습 세션" })).toBeInTheDocument();
  });

  it("카테고리 선택 전에는 녹음 시작 버튼이 비활성", () => {
    render(<App guardVerdict={{ kind: "ok" }} />);
    expect(screen.getByRole("button", { name: "녹음 시작" })).toBeDisabled();
  });

  it("인앱 진입 → GuardScreen 분기", () => {
    render(<App guardVerdict={{ kind: "in-app", isKakao: true }} />);
    expect(screen.getByRole("heading", { name: "외부 브라우저로 열어 주세요" })).toBeInTheDocument();
  });

  it("오디오 언락 불가(jsdom: AudioContext 없음) → 녹음이 시작되지 않는다", async () => {
    render(<App guardVerdict={{ kind: "ok" }} />);
    fireEvent.click(screen.getByRole("button", { name: "기술면접" }));
    fireEvent.click(screen.getByRole("button", { name: "녹음 시작" }));
    // 언락 시도(비동기)가 끝나도 녹음은 시작되지 않는다 — 제출 버튼 미출현, 시작 버튼 유지
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "녹음 종료 및 제출" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "녹음 시작" })).toBeInTheDocument();
    });
  });
});
