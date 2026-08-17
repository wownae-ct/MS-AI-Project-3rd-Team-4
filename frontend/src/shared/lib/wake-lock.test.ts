// §5.3 세칙 전건 검증 — 특히 "hidden 중 request 금지"·"auto/수동 release 구분 계측"이 1급 회귀다.
import { describe, expect, it, vi } from "vitest";
import { WakeLockManager, type WakeLockState, type WakeLockTelemetryEvent } from "./wake-lock";

class FakeSentinel {
  private listeners: (() => void)[] = [];
  released = false;

  addEventListener(_type: "release", listener: () => void): void {
    this.listeners.push(listener);
  }

  /** 플랫폼 자동 해제(배터리·절전·hidden) 재현 */
  dispatchRelease(): void {
    this.released = true;
    for (const l of this.listeners) l();
  }

  async release(): Promise<void> {
    this.dispatchRelease();
  }
}

function setup(opts: { failTimes?: number; visibility?: DocumentVisibilityState } = {}) {
  let remainingFails = opts.failTimes ?? 0;
  const sentinels: FakeSentinel[] = [];
  const states: WakeLockState[] = [];
  const events: WakeLockTelemetryEvent[] = [];
  const request = vi.fn(async (_type: "screen") => {
    if (remainingFails > 0) {
      remainingFails -= 1;
      throw new DOMException("NotAllowedError");
    }
    const s = new FakeSentinel();
    sentinels.push(s);
    return s;
  });
  const manager = new WakeLockManager({
    wakeLock: { request },
    getVisibility: () => opts.visibility ?? "visible",
    onStateChange: (s) => states.push(s),
    onTelemetry: (e) => events.push(e),
  });
  return { manager, request, sentinels, states, events };
}

describe("WakeLockManager (§5.3)", () => {
  it("제스처 획득 성공 → active, request('screen') 1회", async () => {
    const { manager, request, states } = setup();
    await expect(manager.acquireFromGesture()).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith("screen");
    expect(states).toEqual(["active"]);
  });

  it("미지원 환경 → unsupported (조용한 실패 금지 — 상태로 표면화)", async () => {
    const states: WakeLockState[] = [];
    const manager = new WakeLockManager({ wakeLock: undefined, onStateChange: (s) => states.push(s) });
    await expect(manager.acquireFromGesture()).resolves.toBe(false);
    expect(states).toEqual(["unsupported"]);
  });

  it("⚠ hidden 중에는 request 자체를 호출하지 않는다 (규범: hidden 중 request 금지)", async () => {
    const { manager, request } = setup({ visibility: "hidden" });
    await expect(manager.acquireFromGesture()).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("획득 실패 → failed + acquire_failed 계측 (배너 경로)", async () => {
    const { manager, states, events } = setup({ failTimes: 1 });
    await expect(manager.acquireFromGesture()).resolves.toBe(false);
    expect(states).toEqual(["failed"]);
    expect(events).toEqual(["acquire_failed"]);
  });

  it("플랫폼 자동 해제 → released-auto + auto_released 계측 (release 이벤트 단일 핸들러)", async () => {
    const { manager, sentinels, states, events } = setup();
    await manager.acquireFromGesture();
    sentinels[0].dispatchRelease();
    expect(states).toEqual(["active", "released-auto"]);
    expect(events).toEqual(["auto_released"]);
  });

  it("수동 release → inactive — auto_released로 오계측하지 않는다", async () => {
    const { manager, states, events } = setup();
    await manager.acquireFromGesture();
    await manager.release();
    expect(states).toEqual(["active", "inactive"]);
    expect(events).toEqual([]);
  });

  it("자동 해제 후 visible 복귀 재획득 → active 복원", async () => {
    const { manager, sentinels, request, states } = setup();
    await manager.acquireFromGesture();
    sentinels[0].dispatchRelease();
    await expect(manager.reacquireOnReturn()).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toBe("active");
  });

  it("재획득 실패 → reacquire_failed (acquire_failed와 구분 계측)", async () => {
    const { manager, events } = setup({ failTimes: 2 });
    await manager.acquireFromGesture(); // 실패 1 — acquire_failed (wanted는 유지됨)
    await manager.reacquireOnReturn(); // 실패 2 — reacquire_failed
    expect(events).toEqual(["acquire_failed", "reacquire_failed"]);
  });

  it("원한 적 없거나 수동 해제된 상태의 재획득은 no-op (세션 종료 후 락 부활 방지)", async () => {
    const { manager, request } = setup();
    await expect(manager.reacquireOnReturn()).resolves.toBe(false);
    await manager.acquireFromGesture();
    await manager.release();
    await expect(manager.reacquireOnReturn()).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
