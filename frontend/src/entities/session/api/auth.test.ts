// 인증 호출의 계약. 응답은 snake_case 로 오고 화면은 camelCase 를 쓴다 —
// 그 경계를 여기 한 곳에 둔다(도메인 타입이 전송 형식을 따라가면 화면이 지저분해진다).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiBase, isApiError } from "@/shared/api";
import { getMe, login, logout, signup, socialLoginUrl } from "./auth";

const RAW = { id: "u-1", email: "a@b.c", display_name: "가나", has_wedding: true };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("응답 매핑", () => {
  it("snake_case 를 camelCase 도메인 타입으로 바꾼다", async () => {
    fetchMock.mockResolvedValue(json(RAW));
    await expect(getMe()).resolves.toEqual({
      id: "u-1", email: "a@b.c", displayName: "가나", hasWedding: true,
    });
  });

  it("display_name 이 null 이어도 받는다", async () => {
    fetchMock.mockResolvedValue(json({ ...RAW, display_name: null }));
    await expect(getMe()).resolves.toMatchObject({ displayName: null });
  });
});

describe("signup 의 has_wedding 은 신뢰하지 않는다", () => {
  it("서버가 true 를 줘도 false 로 강제한다 — 백엔드가 항상 false 를 하드코딩하고 있어 값이 의미 없다", async () => {
    fetchMock.mockResolvedValue(json({ ...RAW, has_wedding: true }, 201));
    await expect(signup({ email: "a@b.c", password: "12345678", displayName: "가나" })).resolves.toMatchObject({
      hasWedding: false,
    });
  });
});

describe("요청 형태", () => {
  it("login 은 POST 로 email·password 를 보낸다", async () => {
    fetchMock.mockResolvedValue(json(RAW));
    await login({ email: "a@b.c", password: "pw" });
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe(`${apiBase()}/api/v1/auth/login`);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ email: "a@b.c", password: "pw" });
  });

  it("signup 은 display_name 키로 보낸다 — 백엔드 필드명이 곧 JSON 키다", async () => {
    fetchMock.mockResolvedValue(json(RAW, 201));
    await signup({ email: "a@b.c", password: "12345678", displayName: "가나" });
    const init = fetchMock.mock.calls.at(-1)![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      email: "a@b.c", password: "12345678", display_name: "가나",
    });
  });

  it("logout 은 204 를 정상으로 받는다", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(logout()).resolves.toBeUndefined();
  });
});

describe("에러", () => {
  it("401 INVALID_CREDENTIALS 를 그대로 올린다 — 화면이 code 로 분기한다", async () => {
    fetchMock.mockResolvedValue(json({ error: { code: "INVALID_CREDENTIALS", message: "…" } }, 401));
    await expect(login({ email: "a@b.c", password: "x" })).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.code === "INVALID_CREDENTIALS",
    );
  });
});

describe("소셜 로그인은 fetch 가 아니라 전체 페이지 이동이다", () => {
  it("이동할 URL 을 만들어 준다", () => {
    expect(socialLoginUrl("google")).toBe(`${apiBase()}/api/v1/auth/google/login`);
    expect(socialLoginUrl("naver")).toBe(`${apiBase()}/api/v1/auth/naver/login`);
  });
});
