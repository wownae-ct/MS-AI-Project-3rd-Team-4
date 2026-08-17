// §4.4.3 윈도우 계약 (P0) — 실측 프레임을 t_offset_ms 기준 고정 격자에 리샘플해 frame_count = 30을 채운다.
// 채널 의미에 무지(agnostic)한 순수 로직 — CANON19 매핑(G-3)과 독립이라 게이트 확정 전에 구현·검증 가능.
// DOM 비의존 (tsconfig.worker) — import는 shared/protocol만 (§6.1.1).
import {
  BYTES_PER_FRAME,
  FRAMES_PER_WINDOW,
  MIN_VALID_FRAME_RATIO,
  WINDOW_DURATION_MS,
  WINDOW_STRIDE_MS,
} from "../protocol/constants";

/** 프레임당 float 수 (456B / 4) */
export const FLOATS_PER_FRAME = BYTES_PER_FRAME / 4;

const SLOT_INTERVAL_MS = WINDOW_DURATION_MS / FRAMES_PER_WINDOW;

export interface TimedFrame {
  /** §3.4 session_epoch 기준 단조 경과 ms */
  tOffsetMs: number;
  /** CANON19 변환 결과 114 float — 이 모듈은 채널 의미를 해석하지 않는다 */
  data: Float32Array;
}

export interface AssembledWindow {
  windowStartMs: number;
  /** 30 × 114 float = 13,680B — 「윈도우 계약」 payload */
  payload: Float32Array;
  /** §3.3 flags bit0 근거 — 보간(양측 lerp)·최근접 홀드가 1회라도 쓰였는가 */
  interpolated: boolean;
  /** 윈도우 구간 내 실측 프레임 수 (계측·비율 판정 근거) */
  measuredFrameCount: number;
}

/**
 * 한 윈도우 [windowStartMs, +WINDOW_DURATION_MS) 조립. 실측/30 비율이 「윈도우 계약」 하한 미만이면
 * null(미전송 — 호출측이 dropped_window_count 증가). frames는 시간 오름차순 전제.
 * 보간 소스는 전달된 frames 전체 — 경계 슬롯은 인접 스트라이드의 프레임으로도 보간될 수 있다.
 */
export function assembleWindow(frames: readonly TimedFrame[], windowStartMs: number): AssembledWindow | null {
  const windowEndMs = windowStartMs + WINDOW_DURATION_MS;
  let measuredFrameCount = 0;
  for (const f of frames) {
    if (f.tOffsetMs >= windowStartMs && f.tOffsetMs < windowEndMs) measuredFrameCount += 1;
  }
  if (measuredFrameCount / FRAMES_PER_WINDOW < MIN_VALID_FRAME_RATIO) return null;

  const payload = new Float32Array(FRAMES_PER_WINDOW * FLOATS_PER_FRAME);
  let interpolated = false;
  let cursor = 0; // frames가 오름차순이므로 슬롯 진행에 따라 단조 전진

  for (let slot = 0; slot < FRAMES_PER_WINDOW; slot += 1) {
    const slotT = windowStartMs + slot * SLOT_INTERVAL_MS;
    while (cursor < frames.length && frames[cursor].tOffsetMs <= slotT) cursor += 1;
    const prev = cursor > 0 ? frames[cursor - 1] : undefined; // 마지막 t <= slotT
    const next = cursor < frames.length ? frames[cursor] : undefined; // 첫 t > slotT
    const out = payload.subarray(slot * FLOATS_PER_FRAME, (slot + 1) * FLOATS_PER_FRAME);

    if (prev && prev.tOffsetMs === slotT) {
      out.set(prev.data); // 실측이 격자에 정확히 일치 — 보간 아님
    } else if (prev && next) {
      // 양측 실측 → 선형 보간 (§4.4.3)
      const ratio = (slotT - prev.tOffsetMs) / (next.tOffsetMs - prev.tOffsetMs);
      for (let i = 0; i < FLOATS_PER_FRAME; i += 1) {
        out[i] = prev.data[i] + (next.data[i] - prev.data[i]) * ratio;
      }
      interpolated = true;
    } else {
      // 한쪽뿐 → 최근접 홀드 (§4.4.3). 비율 하한을 통과했으므로 최소 1개 실측이 반드시 존재한다.
      const hold = prev ?? next;
      if (!hold) return null; // 방어 — 도달 불가 경로
      out.set(hold.data);
      interpolated = true;
    }
  }

  return { windowStartMs, payload, interpolated, measuredFrameCount };
}

/**
 * 스트라이드 격자 수집기 — 윈도우 시작은 세션 격자(k × WINDOW_STRIDE_MS)에 고정한다.
 * 재연결·재바인딩과 무관하게 격자가 유지되는 전제는 t_offset_ms 원점 규정(§3.4)이 담보한다.
 */
export class WindowCollector {
  private frames: TimedFrame[] = [];
  private nextWindowStartMs: number | null = null;

  constructor(
    private readonly emit: (window: AssembledWindow) => void,
    /** 비율 미달 미전송 — dropped_window_count 증가 지점 (§4.4.3·§6.5) */
    private readonly onDrop: (windowStartMs: number) => void,
  ) {}

  /** rVFC 캡처 순서 전제의 단조 증가 입력 — 비단조 프레임은 방어적으로 폐기한다 */
  push(frame: TimedFrame): void {
    const last = this.frames.at(-1);
    if (last && frame.tOffsetMs <= last.tOffsetMs) return;
    this.frames.push(frame);
    if (this.nextWindowStartMs === null) {
      // 첫 실측을 포함하는 격자 칸부터 시작 — 세션 초입의 빈 윈도우를 드롭으로 오계상하지 않는다
      this.nextWindowStartMs = Math.floor(frame.tOffsetMs / WINDOW_STRIDE_MS) * WINDOW_STRIDE_MS;
    }
    // 윈도우 종결 = 그 끝 이후의 실측이 도착한 시점 (더 채워질 수 없음이 확정)
    while (frame.tOffsetMs >= this.nextWindowStartMs + WINDOW_DURATION_MS) {
      this.closeWindow(this.nextWindowStartMs);
      this.nextWindowStartMs += WINDOW_STRIDE_MS;
      this.evict();
    }
  }

  /**
   * 세션 종료 시 잔여분 처리 — 실측이 걸쳐 있는(시작 ≤ 마지막 실측) 미종결 윈도우 **전부**를
   * emit 또는 onDrop으로 종결한다. 일부만 처리하면 dropped_window_count 계량이 누락된다 (§6.5).
   */
  flush(): void {
    if (this.nextWindowStartMs === null) return;
    const last = this.frames.at(-1);
    if (last) {
      while (this.nextWindowStartMs <= last.tOffsetMs) {
        this.closeWindow(this.nextWindowStartMs);
        this.nextWindowStartMs += WINDOW_STRIDE_MS;
      }
    }
    this.frames = [];
    this.nextWindowStartMs = null;
  }

  private closeWindow(startMs: number): void {
    const assembled = assembleWindow(this.frames, startMs);
    if (assembled) this.emit(assembled);
    else this.onDrop(startMs);
  }

  private evict(): void {
    if (this.nextWindowStartMs === null) return;
    // 다음 윈도우 첫 슬롯(t = nextWindowStartMs)의 보간 prev 후보는 "t <= 시작점인 마지막 프레임" —
    // 그보다 오래된 프레임은 어떤 미래 슬롯에도 쓰이지 않으므로 버린다 (메모리 상한 확보)
    let lastLE = -1;
    for (let i = 0; i < this.frames.length && this.frames[i].tOffsetMs <= this.nextWindowStartMs; i += 1) {
      lastLE = i;
    }
    if (lastLE > 0) this.frames = this.frames.slice(lastLE);
  }
}
