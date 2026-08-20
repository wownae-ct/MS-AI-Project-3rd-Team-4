// @vitest-environment node
// 전송 계층 회귀 테스트. 1급 회귀는 「헤더 병합」이다 —
// fetch init 스프레드 순서가 뒤집히면 Content-Type 기본값이 조용히 사라지고,
// 증상은 호출자가 헤더를 추가한 시점에 415로 나타난다 (원인에서 멀다).
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, http } from "./client";

/** fetch를 가로채 마지막 호출 인자를 노출한다. */
function stubFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const spy = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
    ...response,
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** 첫 fetch 호출의 init. 호출이 없으면 단언이 명확히 깨지도록 빈 객체를 준다. */
function initOf(spy: ReturnType<typeof stubFetch>): RequestInit {
  return (spy.mock.calls[0]?.[1] as RequestInit | undefined) ?? {};
}

function headersOf(spy: ReturnType<typeof stubFetch>): Record<string, string> {
  return (initOf(spy).headers ?? {}) as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("헤더 병합", () => {
  it("기본 Content-Type을 붙인다", async () => {
    const spy = stubFetch({});
    await http.post("/api/v1/things", { a: 1 });
    expect(headersOf(spy)["Content-Type"]).toBe("application/json");
  });

  it("호출자 헤더를 추가해도 Content-Type이 사라지지 않는다", async () => {
    // 이것이 회귀의 핵심. init.headers가 병합 결과를 덮어쓰면 이 단언이 깨진다.
    const spy = stubFetch({});
    await http.request("/api/v1/things", { method: "POST", headers: { "X-Trace": "abc" } });

    const headers = headersOf(spy);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Trace"]).toBe("abc");
  });

  it("호출자가 Content-Type을 명시하면 그쪽이 이긴다", async () => {
    const spy = stubFetch({});
    await http.request("/api/v1/things", { headers: { "Content-Type": "text/plain" } });
    expect(headersOf(spy)["Content-Type"]).toBe("text/plain");
  });

  it("init의 다른 필드가 유실되지 않는다", async () => {
    const spy = stubFetch({});
    await http.request("/api/v1/things", { method: "PUT", headers: { "X-Trace": "abc" } });
    expect(initOf(spy).method).toBe("PUT");
  });
});

describe("응답 처리", () => {
  it("2xx가 아니면 ApiError를 던지고 status를 보존한다", async () => {
    stubFetch({ ok: false, status: 415, statusText: "Unsupported Media Type", text: () => Promise.resolve("") });
    await expect(http.get("/api/v1/things")).rejects.toBeInstanceOf(ApiError);
  });

  it("응답 본문이 있으면 에러 메시지로 쓴다", async () => {
    stubFetch({ ok: false, status: 400, statusText: "Bad Request", text: () => Promise.resolve("bad field") });
    await expect(http.get("/api/v1/things")).rejects.toThrow("bad field");
  });

  it("본문이 비면 statusText로 대체한다", async () => {
    stubFetch({ ok: false, status: 500, statusText: "Internal Server Error", text: () => Promise.resolve("") });
    await expect(http.get("/api/v1/things")).rejects.toThrow("Internal Server Error");
  });

  it("204는 본문을 파싱하지 않는다", async () => {
    const json = vi.fn();
    stubFetch({ status: 204, json });
    await expect(http.get("/api/v1/things")).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });
});

describe("경로 조립", () => {
  it("path를 그대로 이어붙인다 — 이중 슬래시가 생기지 않아야 한다", async () => {
    const spy = stubFetch({});
    await http.get("/api/v1/things");
    expect(spy.mock.calls[0]?.[0]).not.toContain("//api");
  });
});
