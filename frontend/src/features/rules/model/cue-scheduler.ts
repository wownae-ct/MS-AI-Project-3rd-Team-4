// §4.5.2 큐 재생 스케줄링 — 「모델·오디오」 디바운스 + 우선순위 안전 > 폼 > 격려.
// 재생 매체(오디오 스프라이트)와 자막 표시는 주입된 콜백 책임 — 이 모듈은 "언제 무엇을"만 결정한다.
// 설계 결정: 디바운스는 우선순위와 무관하게 전 큐에 적용한다(연타 방지 목적) — 쿨다운 중에는
// 최고 우선순위 1건만 대기시켰다가 쿨다운 종료 시 방출한다 (06 플랜).
import { CUE_MIN_INTERVAL_MS } from "../../../shared/config";

/** §4.5.2 우선순위 — 안전 > 폼 > 격려 */
export type CuePriority = "safety" | "form" | "encourage";

const PRIORITY_RANK: Record<CuePriority, number> = { safety: 0, form: 1, encourage: 2 };

export interface CueRequest {
  /** 오디오 스프라이트 큐 식별자 (cue_phrase) */
  id: string;
  priority: CuePriority;
}

export class CueScheduler {
  private lastPlayedAtMs = Number.NEGATIVE_INFINITY;
  private pending: CueRequest | null = null;

  constructor(
    /** 재생 + 자막 표시(§4.5.2 접근성 — 자막 필수)를 함께 수행하는 콜백 */
    private readonly play: (cue: CueRequest) => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** 판정 경로에서 호출 — 쿨다운이면 대기 슬롯 경쟁(더 높은 우선순위만 교체) */
  request(cue: CueRequest): void {
    if (this.tryPlay(cue)) return;
    if (!this.pending || PRIORITY_RANK[cue.priority] < PRIORITY_RANK[this.pending.priority]) {
      this.pending = cue;
    }
  }

  /** 주기 틱(rAF·타이머)에서 호출 — 쿨다운이 끝났으면 대기 큐를 방출 */
  tick(): void {
    if (this.pending && this.tryPlay(this.pending)) {
      this.pending = null;
    }
  }

  private tryPlay(cue: CueRequest): boolean {
    const t = this.now();
    if (t - this.lastPlayedAtMs < CUE_MIN_INTERVAL_MS) return false;
    this.lastPlayedAtMs = t;
    this.play(cue);
    return true;
  }
}
