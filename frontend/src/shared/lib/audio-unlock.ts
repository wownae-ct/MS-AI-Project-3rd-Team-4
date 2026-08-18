// §4.5.2 오디오 언락 — 공식 패턴: 제스처 전 생성된 AudioContext는 'suspended'로 시작하므로
// 세션 시작 버튼(제스처) 핸들러 안에서 resume()을 호출한다 (Wake Lock §5.3과 동일 핸들러).
// state !== 'running'이면 세션 시작을 차단하고 안내한다. 무음 버퍼 재생 기법은 쓰지 않는다(비공식 구전).

export type AudioUnlockState = "locked" | "running" | "blocked" | "unsupported";

interface AudioContextLike {
  readonly state: AudioContextState;
  resume(): Promise<void>;
}

export interface AudioUnlockOptions {
  onStateChange?: (state: AudioUnlockState) => void;
  /** 테스트 주입 — 미지정 시 전역 AudioContext */
  createContext?: (() => AudioContextLike) | undefined;
}

export class AudioUnlock {
  private readonly createContext: (() => AudioContextLike) | undefined;
  private readonly onStateChange: (state: AudioUnlockState) => void;
  private ctx: AudioContextLike | null = null;

  state: AudioUnlockState = "locked";

  constructor(options: AudioUnlockOptions = {}) {
    this.createContext =
      options.createContext ?? (typeof AudioContext !== "undefined" ? () => new AudioContext() : undefined);
    this.onStateChange = options.onStateChange ?? (() => undefined);
  }

  /** 재생용 컨텍스트 — 언락 성공 후에만 존재 */
  get context(): AudioContextLike | null {
    return this.state === "running" ? this.ctx : null;
  }

  /**
   * 세션 시작 제스처 핸들러 안에서 호출한다. false면 세션 시작을 차단한다 (§4.5.2 —
   * 조용한 실패 금지: 상태는 onStateChange로 안내 UI에 반영).
   */
  async unlockFromGesture(): Promise<boolean> {
    if (!this.createContext) {
      this.setState("unsupported");
      return false;
    }
    this.ctx ??= this.createContext();
    try {
      await this.ctx.resume();
    } catch {
      // resume 거부 — 아래 state 검사에서 blocked로 수렴 (예외를 삼키고 상태로 표면화)
    }
    if (this.ctx.state !== "running") {
      this.setState("blocked");
      return false;
    }
    this.setState("running");
    return true;
  }

  private setState(state: AudioUnlockState): void {
    if (this.state === state) return;
    this.state = state;
    this.onStateChange(state);
  }
}
