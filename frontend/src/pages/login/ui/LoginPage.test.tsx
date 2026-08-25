// /login 은 두 가지를 한다: 폼 2종(로그인·가입)과 oauth_error 표시.
// 라우팅 배선은 app/App.test.tsx 가 따로 본다 — 여기서는 화면 동작만 고정한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { oauthErrorMessage } from "./oauth-error";
import { LoginPage } from "./LoginPage";

describe("oauth_error 매핑", () => {
  // 백엔드가 소문자 snake 와 SCREAMING 을 섞어 보낸다 — 원문 그대로 받아야 한다.
  it.each([
    "unsupported_provider", "denied", "state_missing", "state_invalid",
    "state_mismatch", "upstream_failed",
    "EMAIL_ALREADY_EXISTS", "SOCIAL_ACCOUNT_ALREADY_LINKED", "UPSTREAM_LLM_ERROR", "UNKNOWN_ERROR",
  ])("%s 에 한국어 문구가 있다", (code) => {
    expect(oauthErrorMessage(code)).toMatch(/[가-힣]/u);
  });

  it("모르는 코드도 빈 문자열을 주지 않는다 — 조용히 사라지면 안 된다", () => {
    expect(oauthErrorMessage("무언가_새로운_코드")).toMatch(/[가-힣]/u);
  });

  it("state 만료는 원인을 짚어 준다 — 사용자가 무엇을 다시 해야 하는지 알아야 한다", () => {
    expect(oauthErrorMessage("state_missing")).toContain("다시");
  });
});

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
  useSearch: () => ({}),
}));

const loginFn = vi.fn();
const signupFn = vi.fn();
const invalidateSessionFn = vi.fn();
const getMeFn = vi.fn();
vi.mock("@/entities/session", () => ({
  login: (...a: unknown[]) => loginFn(...a),
  signup: (...a: unknown[]) => signupFn(...a),
  socialLoginUrl: (p: string) => `https://api.test/api/v1/auth/${p}/login`,
  invalidateSession: () => invalidateSessionFn(),
  getMe: () => getMeFn(),
}));

beforeEach(() => {
  navigate.mockReset();
  loginFn.mockReset();
  signupFn.mockReset();
  invalidateSessionFn.mockReset();
  getMeFn.mockReset();
  getMeFn.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: false });
});
afterEach(() => vi.restoreAllMocks());

describe("로그인 폼", () => {
  it("성공하면 웨딩 유무로 분기한다 — 없으면 온보딩", async () => {
    loginFn.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: false });
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("이메일"), "a@b.c");
    await userEvent.type(screen.getByLabelText("비밀번호"), "pw123456");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/onboarding" }));
    // 세션 캐시(TTL 60초)를 비우지 않으면 방금 로그인한 hasWedding 이 반영되지 않는다.
    expect(invalidateSessionFn).toHaveBeenCalled();
  });

  it("웨딩이 있으면 홈으로 간다", async () => {
    loginFn.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: true });
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("이메일"), "a@b.c");
    await userEvent.type(screen.getByLabelText("비밀번호"), "pw123456");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/" }));
  });

  it("실패는 화면에 드러난다 — 조용히 아무 일도 안 일어나면 안 된다", async () => {
    const { ApiError } = await import("@/shared/api");
    loginFn.mockRejectedValue(new ApiError({ code: "INVALID_CREDENTIALS", message: "x", status: 401, extra: {} }));
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("이메일"), "a@b.c");
    await userEvent.type(screen.getByLabelText("비밀번호"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/이메일 또는 비밀번호/u);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("로그인은 성공했지만 세션 쿠키가 왕복하지 않으면(시크릿 모드 등) 이동하지 않는다", async () => {
    loginFn.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: false });
    getMeFn.mockRejectedValue(new Error("401"));
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("이메일"), "a@b.c");
    await userEvent.type(screen.getByLabelText("비밀번호"), "pw123456");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/로그인 상태가 유지되지 않/u);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("세션 쿠키가 정상 왕복하면 그대로 이동한다", async () => {
    loginFn.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: false });
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("이메일"), "a@b.c");
    await userEvent.type(screen.getByLabelText("비밀번호"), "pw123456");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(getMeFn).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/onboarding" }));
  });
});

describe("가입 → 로그인 자동 채움", () => {
  // 요구 플로우 ③: 가입에 성공하면 로그인 폼에 방금 쓴 아이디·비밀번호가 남아 있어야 한다.
  // 어디에도 저장하지 않는다 — 컴포넌트 상태로만 들고 있다가 로그인 제출 시 소비된다.
  it("가입에 성공하면 로그인 모드로 돌아가고 입력값이 그대로 남는다", async () => {
    signupFn.mockResolvedValue({ id: "u", email: "new@b.c", displayName: null, hasWedding: false });
    render(<LoginPage />);

    await userEvent.click(screen.getByRole("button", { name: "계정이 없으신가요? 회원가입" }));
    await userEvent.type(screen.getByLabelText("이름"), "홍길동");
    await userEvent.type(screen.getByLabelText("이메일"), "new@b.c");
    await userEvent.type(screen.getByLabelText("비밀번호"), "pw123456");
    await userEvent.click(screen.getByRole("button", { name: "회원가입" }));

    expect(signupFn).toHaveBeenCalledWith({ email: "new@b.c", password: "pw123456", displayName: "홍길동" });
    // 가입도 쿠키를 발급하므로 세션 캐시를 비운다 — 안 그러면 곧이은 login 이전에 낡은 세션이 보인다.
    expect(invalidateSessionFn).toHaveBeenCalled();
    // 곧바로 로그인시키지 않는다 — 요구 플로우가 로그인을 한 번 더 거친다.
    expect(navigate).not.toHaveBeenCalled();

    expect(await screen.findByRole("button", { name: "로그인" })).toBeInTheDocument();
    expect(screen.getByLabelText("이메일")).toHaveValue("new@b.c");
    expect(screen.getByLabelText("비밀번호")).toHaveValue("pw123456");
  });
});
