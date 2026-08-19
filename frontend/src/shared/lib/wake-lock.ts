// Screen Wake Lock — OS 화면 잠금에 의한 세션 단절을 발생 자체에서 차단하는 1차 방어.
// 규칙: ① 획득은 세션 시작 제스처 핸들러 안(오디오 언락과 동일 핸들러) ② WakeLockSentinel의
// release 이벤트 필수 구독(배터리 부족·절전에서도 자동 해제됨 — 단일 핸들러에서 상태 반영+계측)
// ③ 재획득은 visible/pageshow 복귀에서만 — hidden 중 request() 금지(거부됨) ④ 실패 시 배너.

export type WakeLockState = "inactive" | "active" | "released-auto" | "failed" | "unsupported";

/** wake_lock_failure_rate 계측 이벤트 — release 이벤트 핸들러에서 계상 */
export type WakeLockTelemetryEvent = "acquire_failed" | "reacquire_failed" | "auto_released";

interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

interface WakeLockSentinelLike {
  addEventListener(type: "release", listener: () => void): void;
  release(): Promise<void>;
}

export interface WakeLockManagerOptions {
  /** 배너 표시 등 UI 반영 (실패 시 배너) */
  onStateChange?: (state: WakeLockState) => void;
  onTelemetry?: (event: WakeLockTelemetryEvent) => void;
  /** 테스트 주입 — 미지정 시 navigator.wakeLock */
  wakeLock?: WakeLockLike | undefined;
  /** 테스트 주입 — 미지정 시 document.visibilityState */
  getVisibility?: () => DocumentVisibilityState;
}

export class WakeLockManager {
  private readonly wakeLock: WakeLockLike | undefined;
  private readonly getVisibility: () => DocumentVisibilityState;
  private readonly onStateChange: (state: WakeLockState) => void;
  private readonly onTelemetry: (event: WakeLockTelemetryEvent) => void;

  private sentinel: WakeLockSentinelLike | null = null;
  /** 세션이 락을 원하는 상태인가 — 재획득 판단 기준 (수동 release 시 해제) */
  private wanted = false;
  /** 수동 release 중임을 표시 — release 이벤트 단일 핸들러가 auto와 구분하는 근거 */
  private releasingIntentionally = false;
  /** 진행 중 request — pageshow와 visibilitychange(visible)가 연달아 발화해도 획득은 1회만 (이중 발화 방지) */
  private pendingRequest: Promise<boolean> | null = null;

  state: WakeLockState = "inactive";

  constructor(options: WakeLockManagerOptions = {}) {
    this.wakeLock =
      options.wakeLock ??
      (typeof navigator !== "undefined" && "wakeLock" in navigator
        ? (navigator.wakeLock as unknown as WakeLockLike)
        : undefined);
    this.getVisibility = options.getVisibility ?? (() => document.visibilityState);
    this.onStateChange = options.onStateChange ?? (() => undefined);
    this.onTelemetry = options.onTelemetry ?? (() => undefined);
  }

  private setState(state: WakeLockState): void {
    // 멱등 — 수동 release는 release 이벤트 핸들러와 release()의 finally 두 경로로 도달하므로
    // 동일 상태 재통지를 걸러 UI(배너)·계측의 중복 반응을 막는다
    if (this.state === state) return;
    this.state = state;
    this.onStateChange(state);
  }

  /** 세션 시작 제스처 핸들러에서 호출한다 (제스처 밖 호출은 플랫폼이 거부할 수 있음) */
  async acquireFromGesture(): Promise<boolean> {
    this.wanted = true;
    return this.request("acquire_failed");
  }

  /** visible/pageshow 복귀 경로 전용 — 다른 곳에서 호출하지 않는다 */
  async reacquireOnReturn(): Promise<boolean> {
    if (!this.wanted) return false; // 세션이 원한 적 없거나 수동 해제됨 — 재획득 대상 아님
    return this.request("reacquire_failed");
  }

  private request(failureEvent: WakeLockTelemetryEvent): Promise<boolean> {
    if (!this.wakeLock) {
      this.setState("unsupported");
      return Promise.resolve(false);
    }
    // 규범: hidden 중 request() 금지 — 플랫폼이 거부한다. 호출 자체를 차단해 불필요한 실패 계측을 막는다.
    if (this.getVisibility() === "hidden") return Promise.resolve(false);
    // 이중 획득 방지: 활성 sentinel이 있으면 그대로 성공 — 새로 요청하면 이전 sentinel이
    // 미해제로 잔존(화면 점유 지속)하고, 그 지연 release 이벤트가 새 참조를 오염시킨다.
    if (this.sentinel) return Promise.resolve(true);
    if (this.pendingRequest) return this.pendingRequest;

    const wakeLock = this.wakeLock;
    this.pendingRequest = (async () => {
      try {
        const sentinel = await wakeLock.request("screen");
        this.sentinel = sentinel;
        // release 이벤트 필수 구독 — 해제 사유와 무관한 단일 핸들러
        sentinel.addEventListener("release", () => {
          // 정체성 검사: 교체된 구 sentinel의 지연 이벤트가 현재 참조·상태를 건드리지 못하게 한다
          if (this.sentinel !== sentinel) return;
          this.sentinel = null;
          if (this.releasingIntentionally) {
            this.setState("inactive");
          } else {
            // hidden 전환 외에 배터리 부족·절전에서도 발생 — 계측 후 복귀 시 재획득 대상
            this.onTelemetry("auto_released");
            this.setState("released-auto");
          }
        });
        this.setState("active");
        return true;
      } catch {
        this.onTelemetry(failureEvent);
        this.setState("failed"); // 배너 표시 (onStateChange 경유)
        return false;
      } finally {
        this.pendingRequest = null;
      }
    })();
    return this.pendingRequest;
  }

  /** 수동 해제 — pagehide/freeze·세션 종료 경로 */
  async release(): Promise<void> {
    this.wanted = false;
    const sentinel = this.sentinel;
    if (!sentinel) {
      this.setState("inactive");
      return;
    }
    this.releasingIntentionally = true;
    try {
      await sentinel.release();
    } finally {
      this.releasingIntentionally = false;
      this.sentinel = null;
      this.setState("inactive");
    }
  }
}
