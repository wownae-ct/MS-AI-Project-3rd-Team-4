// §6.2.1 화면 분기 검증 — "URL 복사 경로 항상 병행"과 "iOS 탈출 유도 금지"가 1급 회귀다.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GuardScreen } from "./GuardScreen";

const URL_UNDER_TEST = "https://app.example.com/start";

describe("GuardScreen (§6.2.1)", () => {
  it("카카오톡 인앱 → 탈출 3단계 전부 노출 (전용 스킴 + intent + URL 복사)", () => {
    render(<GuardScreen verdict={{ kind: "in-app", isKakao: true }} currentUrl={URL_UNDER_TEST} />);
    expect(screen.getByRole("heading", { name: "외부 브라우저로 열어 주세요" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /외부 브라우저로 열기/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /기본 브라우저로 이동/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "주소 복사" })).toBeInTheDocument();
    expect(screen.getByText(URL_UNDER_TEST)).toBeInTheDocument();
  });

  it("비카카오 인앱(인스타그램 등) → 전용 스킴 버튼 없음, intent + URL 복사만", () => {
    render(<GuardScreen verdict={{ kind: "in-app", isKakao: false }} currentUrl={URL_UNDER_TEST} />);
    expect(screen.queryByRole("button", { name: /외부 브라우저로 열기/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /기본 브라우저로 이동/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "주소 복사" })).toBeInTheDocument();
  });

  it("⚠ iOS → 비지원 안내만, 탈출 버튼 일절 없음 (탈출해도 WebKit — 규범)", () => {
    render(<GuardScreen verdict={{ kind: "unsupported-ios" }} currentUrl={URL_UNDER_TEST} />);
    expect(screen.getByRole("heading", { name: "지원하지 않는 기기입니다" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument(); // 경고 배너
  });

  it("비지원 브라우저 → 지원 목록 안내 + URL 복사 제공", () => {
    render(
      <GuardScreen verdict={{ kind: "unsupported-browser", missing: ["rvfc"] }} currentUrl={URL_UNDER_TEST} />,
    );
    expect(screen.getByRole("heading", { name: "지원하지 않는 브라우저입니다" })).toBeInTheDocument();
    expect(screen.getByText(/Chrome · Edge · 삼성인터넷 · 웨일/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "주소 복사" })).toBeInTheDocument();
  });
});
