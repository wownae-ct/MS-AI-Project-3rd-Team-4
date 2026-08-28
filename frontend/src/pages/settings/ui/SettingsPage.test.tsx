// /settings 계약 — docs/wedding/refactor/bug-todo.md [결정됨] "유저 설정 화면 신규 추가".
// 라우팅 배선(경로 매핑·가드)은 App.test.tsx가 따로 본다 — 여기서는 화면 동작만 고정한다.
//
// useNavigate/logout/invalidateSession을 목으로 바꾸는 패턴은 LoginPage.test.tsx와 같다 —
// 이 화면은 라우터 트리 없이 컴포넌트 하나만 렌더해도 충분하다(Link를 쓰지 않는다).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "./SettingsPage";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
}));

const logoutFn = vi.fn();
const invalidateSessionFn = vi.fn();
vi.mock("@/entities/session", () => ({
  logout: () => logoutFn(),
  invalidateSession: () => invalidateSessionFn(),
}));

beforeEach(() => {
  navigate.mockReset();
  logoutFn.mockReset();
  invalidateSessionFn.mockReset();
});

describe("로그아웃 — 실구현", () => {
  it("클릭하면 logout → invalidateSession → /login 이동 순서로 실행된다", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(logoutFn).toHaveBeenCalledTimes(1);
    expect(invalidateSessionFn).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ to: "/login", search: { redirect: undefined, oauth_error: undefined } });
  });
});

// bug-todo.md 확정 스코프: 실제 API 호출 로직·에러 처리 코드 자체를 만들지 않는다 — 그 보장이
// 코드 레벨(onClick 자체가 없음)에 있는지를 여기서 고정한다.
describe("비밀번호 변경 · 온보딩 다시하기 — 준비 중 placeholder", () => {
  it("둘 다 비활성 상태이고 '준비 중' 배지를 보여준다", () => {
    render(<SettingsPage />);

    expect(screen.getByRole("button", { name: /비밀번호 변경/u })).toBeDisabled();
    expect(screen.getByRole("button", { name: /온보딩 다시하기/u })).toBeDisabled();
    expect(screen.getAllByText("준비 중")).toHaveLength(2);
  });

  it("비활성 버튼을 클릭해도 세션 API가 전혀 안 불린다", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByRole("button", { name: /비밀번호 변경/u }));
    await user.click(screen.getByRole("button", { name: /온보딩 다시하기/u }));

    expect(logoutFn).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
