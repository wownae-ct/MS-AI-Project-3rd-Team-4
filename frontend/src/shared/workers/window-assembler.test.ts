// §4.4.3 윈도우 계약 검증 — 저프레임(12fps/8fps) 합성 입력이 §7.5 P0 수용 기준의 지정 케이스다.
import { describe, expect, it } from "vitest";
import { assembleWindow, FLOATS_PER_FRAME, WindowCollector, type TimedFrame } from "./window-assembler";
import { FRAMES_PER_WINDOW, WINDOW_DURATION_MS, WINDOW_STRIDE_MS } from "../protocol/constants";

const SLOT_MS = WINDOW_DURATION_MS / FRAMES_PER_WINDOW;

/** 전 채널을 t값으로 채운 프레임 — 선형 보간 결과가 "슬롯 시각"과 일치해야 하므로 검산이 자명해진다 */
function frameAt(tOffsetMs: number): TimedFrame {
  const data = new Float32Array(FLOATS_PER_FRAME);
  data.fill(tOffsetMs);
  return { tOffsetMs, data };
}

/** fps 간격으로 [fromMs, toMs) 구간 프레임 생성 */
function framesAtRate(fps: number, fromMs: number, toMs: number): TimedFrame[] {
  const out: TimedFrame[] = [];
  for (let t = fromMs; t < toMs; t += 1000 / fps) out.push(frameAt(t));
  return out;
}

describe("assembleWindow (§4.4.3)", () => {
  it("격자 정합 30fps 입력 → 30프레임 전 슬롯 실측, INTERPOLATED 아님", () => {
    const frames = Array.from({ length: FRAMES_PER_WINDOW }, (_, i) => frameAt(i * SLOT_MS));
    const w = assembleWindow(frames, 0);
    expect(w).not.toBeNull();
    expect(w?.interpolated).toBe(false);
    expect(w?.measuredFrameCount).toBe(FRAMES_PER_WINDOW);
    expect(w?.payload.length).toBe(FRAMES_PER_WINDOW * FLOATS_PER_FRAME);
  });

  it("12fps(40%) → 전송 + INTERPOLATED, 보간값은 슬롯 시각과 일치 (선형 보간 검산)", () => {
    const frames = framesAtRate(12, 0, WINDOW_DURATION_MS + 100);
    const w = assembleWindow(frames, 0);
    expect(w).not.toBeNull();
    expect(w?.interpolated).toBe(true);
    expect(w?.measuredFrameCount).toBe(12);
    for (let slot = 0; slot < FRAMES_PER_WINDOW; slot += 1) {
      const slotT = slot * SLOT_MS;
      // 값=시각 프레임의 lerp 결과는 정확히 슬롯 시각 (Float32 정밀도 내)
      expect(w?.payload[slot * FLOATS_PER_FRAME]).toBeCloseTo(slotT, 2);
    }
  });

  it("8fps(27%) → 「윈도우 계약」 하한 미만 — null(미전송)", () => {
    const frames = framesAtRate(8, 0, WINDOW_DURATION_MS);
    expect(assembleWindow(frames, 0)).toBeNull();
  });

  it("경계값: 실측 10개(정확히 1/3) → 전송", () => {
    const frames = Array.from({ length: 10 }, (_, i) => frameAt(i * 100));
    expect(assembleWindow(frames, 0)).not.toBeNull();
  });

  it("실측이 후반부에만 존재 → 전반부 슬롯은 최근접 홀드 (한쪽뿐 규칙)", () => {
    const frames = framesAtRate(30, 600, WINDOW_DURATION_MS); // 12개 — 하한 통과
    const w = assembleWindow(frames, 0);
    expect(w).not.toBeNull();
    expect(w?.interpolated).toBe(true);
    // 첫 슬롯(t=0)은 첫 실측(t=600)의 홀드
    expect(w?.payload[0]).toBeCloseTo(600, 2);
  });

  it("인접 스트라이드 프레임을 보간 소스로 사용 가능 (경계 슬롯)", () => {
    // 윈도우 [500, 1500) — t=490(윈도우 밖)과 t=510이 첫 슬롯(t=500)을 보간
    const frames = [frameAt(490), frameAt(510), ...framesAtRate(30, 510, 1500).slice(1)];
    const w = assembleWindow(frames, WINDOW_STRIDE_MS);
    expect(w).not.toBeNull();
    expect(w?.payload[0]).toBeCloseTo(500, 2);
  });
});

describe("WindowCollector — 스트라이드 격자·종결·축출", () => {
  function collect() {
    const emitted: number[] = [];
    const dropped: number[] = [];
    const collector = new WindowCollector(
      (w) => emitted.push(w.windowStartMs),
      (start) => dropped.push(start),
    );
    return { collector, emitted, dropped };
  }

  it("연속 30fps 입력 → 500ms 스트라이드 격자로 윈도우 방출 (50% 오버랩)", () => {
    const { collector, emitted, dropped } = collect();
    for (const f of framesAtRate(30, 0, 2600)) collector.push(f);
    // t=2566까지 도착 → [0,1000)·[500,1500)·[1000,2000)·[1500,2500) 종결
    expect(emitted).toEqual([0, 500, 1000, 1500]);
    expect(dropped).toEqual([]);
  });

  it("한 윈도우 구간의 실측 부족 → onDrop(=dropped_window_count 지점)만 호출", () => {
    const { collector, emitted, dropped } = collect();
    for (const f of framesAtRate(30, 0, 1000)) collector.push(f); // [0,1000) 실측 충분
    for (const f of framesAtRate(4, 1000, 2000)) collector.push(f); // [1000,2000) 4fps
    for (const f of framesAtRate(30, 2000, 3100)) collector.push(f);
    expect(emitted).toContain(0);
    expect(emitted).not.toContain(1000); // 실측 4개 — 드롭
    expect(dropped).toContain(1000);
  });

  it("세션 중간 시작 — 첫 실측의 격자 칸부터 (초입 빈 윈도우를 드롭으로 오계상하지 않음)", () => {
    const { collector, emitted, dropped } = collect();
    for (const f of framesAtRate(30, 3210, 4600)) collector.push(f);
    expect(dropped).toEqual([]);
    expect(emitted[0]).toBe(3000); // floor(3210/500)×500
  });

  it("비단조 입력 방어 — 과거 프레임은 폐기", () => {
    const { collector, emitted } = collect();
    collector.push(frameAt(100));
    collector.push(frameAt(50)); // 폐기 대상
    collector.push(frameAt(100)); // 동일 시각도 폐기
    for (const f of framesAtRate(30, 133, 1100)) collector.push(f);
    expect(emitted).toEqual([0]);
  });

  it("flush — 시작된 마지막 윈도우가 비율 충족이면 홀드 채움 조립", () => {
    const { collector, emitted } = collect();
    for (const f of framesAtRate(30, 0, 1400)) collector.push(f); // [0,1000) 방출됨, [500,1500) 미종결
    expect(emitted).toEqual([0]);
    collector.flush();
    expect(emitted).toEqual([0, 500]); // 잔여 [500,1500): 실측 27개 — 충족
  });

  it("장시간 입력에도 방출 결과 불변 — 축출이 보간 소스를 침식하지 않는다", () => {
    const { collector, emitted, dropped } = collect();
    for (const f of framesAtRate(30, 0, 10_600)) collector.push(f);
    expect(dropped).toEqual([]);
    // 마지막 실측 ≈10,566ms → 시작 0~9,500(500 간격) 윈도우 20개 종결 (9500+1000 ≤ 10,566)
    expect(emitted.length).toBe(20);
    expect(emitted.at(-1)).toBe(9500);
  });
});
