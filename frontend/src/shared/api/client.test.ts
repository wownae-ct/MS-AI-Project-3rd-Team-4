// 전송 계층이 강제하는 계약 5가지를 고정한다(docs/architecture/backend-integration.md §1.2).
//
// #2(헤더 병합 순서)는 이 저장소가 **똑같은 버그로 한 번 데인** 항목이다(layers.md 부록 A).
// 당시엔 아무도 헤더를 안 넘겨 잠복이었지만, 지금은 실제로 헤더를 쓰므로 즉시 발현한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, apiFetchMultipart, onUnauthorized } from "./client";
import { apiBase } from "./env";
import { isApiError } from "./errors";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastInit(): RequestInit {
  return fetchMock.mock.calls.at(-1)![1] as RequestInit;
}

describe("계약 1 — credentials 는 내장이고 끌 수 없다", () => {
  it("항상 include 로 나간다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiFetch("/api/v1/auth/me");
    expect(lastInit().credentials).toBe("include");
  });

  it("호출자가 omit 을 넘겨도 무시된다 — 옵션이면 반드시 빠뜨린다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiFetch("/api/v1/auth/me", { credentials: "omit" });
    expect(lastInit().credentials).toBe("include");
  });
});

describe("계약 2 — 헤더 병합 순서 (layers.md 부록 A 회귀)", () => {
  it("호출자 헤더를 넣어도 Content-Type 이 살아 있다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiFetch("/api/v1/x", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
      headers: { "X-Trace": "1" },
    });
    const headers = new Headers(lastInit().headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-trace")).toBe("1");
  });
});

describe("계약 3 — 경로 조립", () => {
  it("apiBase() 뒤에 path 를 붙인다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiFetch("/api/v1/auth/me");
    expect(fetchMock.mock.calls.at(-1)![0]).toBe(`${apiBase()}/api/v1/auth/me`);
  });
});

describe("계약 4 — 에러는 ApiError 로 던진다", () => {
  it("401 은 code 를 담아 던진다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." } }, 401));
    await expect(apiFetch("/api/v1/auth/me")).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.code === "UNAUTHORIZED" && e.status === 401,
    );
  });

  it("204 는 본문 없이 undefined 를 돌려준다 — 로그아웃이 이 경로다", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetch("/api/v1/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("네트워크 실패도 ApiError 로 감싼다 — 화면이 두 종류 에러를 다루지 않게", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(apiFetch("/api/v1/auth/me")).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.code === "NETWORK_ERROR",
    );
  });
});

describe("계약 4-a — signal 을 그대로 넘긴다", () => {
  it("호출자가 준 AbortSignal 이 fetch 까지 간다 — 안 넘기면 철 지난 응답이 새 화면을 덮어쓴다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const controller = new AbortController();
    await apiFetch("/api/v1/x", { signal: controller.signal });
    expect(lastInit().signal).toBe(controller.signal);
  });
});

describe("설정 오류는 네트워크 오류로 둔갑하지 않는다 (리뷰 finding 1)", () => {
  it("VITE_API_BASE 형식 위반은 API_BASE_INVALID 로 던진다 — fetch 는 시도조차 되지 않는다", async () => {
    // apiBase() 는 성공한 값만 캐시한다(env.ts) — 이 파일의 다른 테스트가 이미 정상 값으로
    // 캐시를 채워 놓았으므로, 위반을 재현하려면 모듈을 새로 불러와야 한다.
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE", "not-a-valid-url");
    // "./errors" 도 이 시점의 모듈 그래프에서 다시 불러온다 — resetModules() 뒤에는
    // "./client" 가 참조하는 ApiError 가 파일 상단에서 정적 import 한 것과 **다른 클래스
    // 인스턴스**다. 상단의 isApiError 로 instanceof 를 검사하면 항상 false 가 나온다.
    const fresh = await import("./client");
    const freshErrors = await import("./errors");
    await expect(fresh.apiFetch("/api/v1/x")).rejects.toSatisfy(
      (e: unknown) => freshErrors.isApiError(e) && e.code === "API_BASE_INVALID",
    );
    // apiBase() 검증은 fetch 호출 이전에 던져야 한다 — 아니면 catch(cause) 가 이 예외를
    // NETWORK_ERROR 로 재포장한다(리뷰 finding 1). fetch 가 호출되지 않았다는 것이 그 증거다.
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

describe("401 구독 — shared 는 누가 듣는지 모른다", () => {
  it("401 이 오면 등록된 핸들러를 부른다", async () => {
    const seen = vi.fn();
    const off = onUnauthorized(seen);
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "UNAUTHORIZED", message: "x" } }, 401));
    await expect(apiFetch("/api/v1/x")).rejects.toThrow();
    expect(seen).toHaveBeenCalledTimes(1);
    off();
  });

  it("해제하면 더 부르지 않는다 — 구독이 누적되면 같은 무효화가 여러 번 돈다", async () => {
    const seen = vi.fn();
    onUnauthorized(seen)();
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "UNAUTHORIZED", message: "x" } }, 401));
    await expect(apiFetch("/api/v1/x")).rejects.toThrow();
    expect(seen).not.toHaveBeenCalled();
  });

  it("401 이 아닌 에러에는 부르지 않는다", async () => {
    const seen = vi.fn();
    const off = onUnauthorized(seen);
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "WEDDING_NOT_FOUND", message: "x" } }, 404));
    await expect(apiFetch("/api/v1/x")).rejects.toThrow();
    expect(seen).not.toHaveBeenCalled();
    off();
  });

  it("구독자 하나가 던져도 나머지 구독자가 호출되고 원본 UNAUTHORIZED 가 그대로 던져진다 (리뷰 finding 2)", async () => {
    const broken = vi.fn(() => {
      throw new Error("구독자 쪽 버그 — 이 예외가 send() 밖으로 새면 안 된다");
    });
    const healthy = vi.fn();
    const offBroken = onUnauthorized(broken);
    const offHealthy = onUnauthorized(healthy);
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "UNAUTHORIZED", message: "x" } }, 401));
    await expect(apiFetch("/api/v1/x")).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.code === "UNAUTHORIZED",
    );
    expect(broken).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
    offBroken();
    offHealthy();
  });
});

describe("계약 5 — 멀티파트는 Content-Type 을 건드리지 않는다", () => {
  it("boundary 를 브라우저가 정하도록 헤더를 비운다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ receipt_url: "https://x" }, 201));
    const form = new FormData();
    form.append("file", new Blob(["x"], { type: "image/png" }), "r.png");
    await apiFetchMultipart("/api/v1/payments/receipt-extract", form);
    const headers = new Headers(lastInit().headers);
    expect(headers.get("content-type")).toBeNull();
    expect(lastInit().credentials).toBe("include");
  });
});
