// app 조립 검증 — 페이즈 전환·진입 가드 분기·오디오 차단 시 세션 시작 불가 (§4.5.2).
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

describe("App 조립", () => {
  it("정상 진입 → 운동 선택 화면", () => {
    render(<App guardVerdict={{ kind: "ok" }} />);
    expect(screen.getByRole("heading", { name: "AI 홈트레이닝 코치" })).toBeInTheDocument();
  });

  it("선택 → 세션 화면 전환", () => {
    render(<App guardVerdict={{ kind: "ok" }} />);
    fireEvent.click(screen.getByRole("button", { name: "세션 준비하기" }));
    expect(screen.getByRole("heading", { name: "세션" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "세션 시작" })).toBeInTheDocument();
  });

  it("인앱 진입 → GuardScreen 분기 (§6.2.1)", () => {
    render(<App guardVerdict={{ kind: "in-app", isKakao: true }} />);
    expect(screen.getByRole("heading", { name: "외부 브라우저로 열어 주세요" })).toBeInTheDocument();
  });

  it("오디오 언락 불가(jsdom: AudioContext 없음) → 세션 시작이 차단된다 (§4.5.2 규범)", async () => {
    render(<App guardVerdict={{ kind: "ok" }} />);
    fireEvent.click(screen.getByRole("button", { name: "세션 준비하기" }));
    fireEvent.click(screen.getByRole("button", { name: "세션 시작" }));
    // 언락 시도(비동기)가 끝나도 세션은 시작되지 않는다 — 종료 버튼 미출현, 시작 버튼 유지
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "세션 종료" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "세션 시작" })).toBeInTheDocument();
    });
  });
});
