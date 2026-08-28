// 캐시는 「네비게이션마다 왕복」을 없애려고 있는 것이다. 그 목적을 테스트가 지킨다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMeMock = vi.fn();
vi.mock("../api/auth", () => ({ getMe: () => getMeMock() }));

const USER = { id: "u", email: "a@b.c", displayName: null, hasWedding: true };

beforeEach(async () => {
  vi.resetModules();
  getMeMock.mockReset().mockResolvedValue(USER);
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

async function fresh() {
  return await import("./session-cache");
}

describe("세션 캐시", () => {
  it("두 번 불러도 네트워크는 한 번이다 — 이게 캐시의 존재 이유다", async () => {
    const { loadSession } = await fresh();
    await loadSession();
    await loadSession();
    expect(getMeMock).toHaveBeenCalledTimes(1);
  });

  it("TTL 이 지나면 다시 조회한다", async () => {
    const { loadSession } = await fresh();
    await loadSession();
    vi.advanceTimersByTime(60_001);
    await loadSession();
    expect(getMeMock).toHaveBeenCalledTimes(2);
  });

  it("무효화하면 즉시 다시 조회한다", async () => {
    const { invalidateSession, loadSession } = await fresh();
    await loadSession();
    invalidateSession();
    await loadSession();
    expect(getMeMock).toHaveBeenCalledTimes(2);
  });

  it("실패는 캐시하지 않는다 — 캐시하면 로그인 직후에도 TTL 동안 튕긴다", async () => {
    const { loadSession } = await fresh();
    getMeMock.mockRejectedValueOnce(new Error("401"));
    await expect(loadSession()).rejects.toThrow();
    getMeMock.mockResolvedValue(USER);
    await expect(loadSession()).resolves.toEqual(USER);
    expect(getMeMock).toHaveBeenCalledTimes(2);
  });
});
