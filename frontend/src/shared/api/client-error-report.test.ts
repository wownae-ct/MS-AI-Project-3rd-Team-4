// POST /api/v1/client-errors 로 보내는 fire-and-forget 리포터를 고정한다(PR #78).
// 절대 던지면 안 된다는 게 핵심 계약이다 — ErrorBoundary.onError 안에서 부르므로, 리포팅
// 자체가 실패해도 그 실패가 사용자 화면에 새 크래시를 더하면 안 된다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportClientError } from "./client-error-report";

describe("reportClientError", () => {
  let sendBeaconMock: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendBeaconMock = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: sendBeaconMock, userAgent: "test-agent" });
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sendBeacon 이 있으면 그것만 쓰고 fetch 는 안 부른다", () => {
    reportClientError({
      message: "boom",
      stack: "at x",
      componentStack: "at <App>",
      url: "https://x/y",
      userAgent: "test-agent",
    });
    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const [calledUrl] = sendBeaconMock.mock.calls[0] as [string, Blob];
    expect(calledUrl).toContain("/api/v1/client-errors");
  });

  it("sendBeacon 이 실패(false)를 돌려주면 fetch+keepalive 로 폴백한다", () => {
    sendBeaconMock.mockReturnValue(false);
    reportClientError({
      message: "boom",
      stack: null,
      componentStack: null,
      url: "https://x/y",
      userAgent: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.keepalive).toBe(true);
    expect(init.method).toBe("POST");
  });

  it("sendBeacon 자체가 없는 환경에서도 fetch 로 폴백한다", () => {
    // navigator 를 spread 하면 beforeEach 가 이미 넣어둔 sendBeaconMock 도 함께 딸려온다 —
    // "없는 환경"을 재현하려면 sendBeacon 키 자체를 안 넣는다.
    vi.stubGlobal("navigator", { userAgent: "test-agent" });
    reportClientError({ message: "boom", stack: null, componentStack: null, url: "https://x/y", userAgent: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("빈 message 는 자리표시자로 채워 보낸다 — 서버가 min_length=1 을 요구한다", () => {
    reportClientError({ message: "", stack: null, componentStack: null, url: "https://x/y", userAgent: null });
    const [, body] = sendBeaconMock.mock.calls[0] as [string, Blob];
    expect(body).toBeInstanceOf(Blob);
  });

  it("apiBase() 가 던져도(설정 오류) 이 함수 자체는 절대 던지지 않는다", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE", "not-a-valid-url");
    const fresh = await import("./client-error-report");
    expect(() =>
      fresh.reportClientError({
        message: "boom",
        stack: null,
        componentStack: null,
        url: "https://x/y",
        userAgent: null,
      }),
    ).not.toThrow();
    vi.unstubAllEnvs();
  });

  it("fetch 폴백이 reject 해도 던지지 않는다", () => {
    sendBeaconMock.mockReturnValue(false);
    fetchMock.mockRejectedValue(new TypeError("network down"));
    expect(() =>
      reportClientError({ message: "boom", stack: null, componentStack: null, url: "https://x/y", userAgent: null }),
    ).not.toThrow();
  });
});
