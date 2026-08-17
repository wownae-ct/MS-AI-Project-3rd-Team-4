// @vitest-environment node
// §4.5.2 — "running 아니면 세션 차단"이 핵심 회귀다.
import { describe, expect, it } from "vitest";
import { AudioUnlock, type AudioUnlockState } from "./audio-unlock";

function fakeContext(behavior: "resumes" | "stays-suspended" | "rejects") {
  return {
    state: "suspended" as AudioContextState,
    async resume() {
      if (behavior === "rejects") throw new DOMException("NotAllowedError");
      if (behavior === "resumes") this.state = "running";
    },
  };
}

describe("AudioUnlock (§4.5.2)", () => {
  it("제스처 resume 성공 → running, context 노출", async () => {
    const states: AudioUnlockState[] = [];
    const unlock = new AudioUnlock({ createContext: () => fakeContext("resumes"), onStateChange: (s) => states.push(s) });
    await expect(unlock.unlockFromGesture()).resolves.toBe(true);
    expect(states).toEqual(["running"]);
    expect(unlock.context).not.toBeNull();
  });

  it("resume 후에도 suspended → blocked·false — 세션 시작 차단 근거 (조용한 실패 금지)", async () => {
    const unlock = new AudioUnlock({ createContext: () => fakeContext("stays-suspended") });
    await expect(unlock.unlockFromGesture()).resolves.toBe(false);
    expect(unlock.state).toBe("blocked");
    expect(unlock.context).toBeNull();
  });

  it("resume 예외도 blocked로 수렴 — 예외를 밖으로 내보내지 않는다", async () => {
    const unlock = new AudioUnlock({ createContext: () => fakeContext("rejects") });
    await expect(unlock.unlockFromGesture()).resolves.toBe(false);
    expect(unlock.state).toBe("blocked");
  });

  it("미지원 환경 → unsupported", async () => {
    const unlock = new AudioUnlock({ createContext: undefined });
    // jsdom에 전역 AudioContext가 없으므로 기본 팩토리도 undefined — 명시 주입과 동일 경로
    await expect(unlock.unlockFromGesture()).resolves.toBe(false);
    expect(unlock.state).toBe("unsupported");
  });

  it("재시도: blocked 후 같은 컨텍스트로 재-resume 성공 가능", async () => {
    const ctx = fakeContext("stays-suspended");
    const unlock = new AudioUnlock({ createContext: () => ctx });
    await unlock.unlockFromGesture();
    expect(unlock.state).toBe("blocked");
    ctx.resume = async function (this: { state: AudioContextState }) {
      this.state = "running";
    };
    await expect(unlock.unlockFromGesture()).resolves.toBe(true);
    expect(unlock.state).toBe("running");
  });
});
