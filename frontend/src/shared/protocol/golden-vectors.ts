// §7.1 골든 바이트 벡터 — 2026-08-17 §3.2 오프셋 표 기준 **손 검산** 값 (리틀엔디언).
// ⚠ 코덱이 회귀하면 이 상수가 기준이다. 코덱 자신의 출력으로 이 값을 갱신하지 않는다(순환 참조 금지) —
//    갱신은 §3.2 표를 다시 손으로 검산했을 때만 (04 문서 §1).
import type { FrameHeaderMeta } from "./frame-header";

export interface GoldenVector {
  readonly name: string;
  readonly meta: FrameHeaderMeta;
  /** 24바이트 헤더의 16진 덤프 (payload_length = 13,680 = 0x3570 → LE '70 35 00 00') */
  readonly headerHex: string;
}

// 검산 메모: offset 0-2 magic 57 56 30 · 3 version 01 · 4 type 01 · 5 flags ·
// 6-7 set_index(u16 LE) · 8-11 seq(u32 LE) · 12-15 window_index(u32 LE) ·
// 16-19 t_offset_ms(u32 LE) · 20-23 payload_length(u32 LE)
export const GOLDEN_VECTORS: readonly GoldenVector[] = [
  {
    name: "G1: 전부 0 (세션 첫 윈도우)",
    meta: { setIndex: 0, seq: 0, windowIndex: 0, tOffsetMs: 0, interpolated: false },
    headerHex: "575630010100" + "0000" + "00000000" + "00000000" + "00000000" + "70350000",
  },
  {
    name: "G2: 대표값 + INTERPOLATED (set 3 · seq 257 · window 42 · t 90,500ms)",
    // 검산: 257 = 0x101 → 01 01 00 00 · 42 = 0x2A → 2a 00 00 00 · 90500 = 0x16184 → 84 61 01 00
    meta: { setIndex: 3, seq: 257, windowIndex: 42, tOffsetMs: 90_500, interpolated: true },
    headerHex: "575630010101" + "0300" + "01010000" + "2a000000" + "84610100" + "70350000",
  },
  {
    name: "G3: u16/u32 상한 경계 (set 65,535 · seq/t_offset 2^32-1 · window 65,536)",
    // 검산: 65536 = 0x00010000 → 00 00 01 00
    meta: { setIndex: 65_535, seq: 4_294_967_295, windowIndex: 65_536, tOffsetMs: 4_294_967_295, interpolated: false },
    headerHex: "575630010100" + "ffff" + "ffffffff" + "00000100" + "ffffffff" + "70350000",
  },
];

/** §7.1 거부 벡터 — 각각 "폐기 + 카운터, 예외 불방출"을 검증한다 (§3.5) */
export const REJECT_VECTORS = [
  { name: "잘못된 magic (첫 바이트 0x58)", reason: "magic", headerHex: "585630010100" + "0000" + "00000000" + "00000000" + "00000000" + "70350000" },
  { name: "version 불일치 (2)", reason: "version", headerHex: "575630020100" + "0000" + "00000000" + "00000000" + "00000000" + "70350000" },
  { name: "payload_length 등식 위반 (13,676 = 0x356C)", reason: "length", headerHex: "575630010100" + "0000" + "00000000" + "00000000" + "00000000" + "6c350000" },
  { name: "빅엔디안 기록 (payload_length BE) → LE로 0x70350000 초과 판독", reason: "oversize", headerHex: "575630010100" + "0000" + "00000000" + "00000000" + "00000000" + "00003570" },
  { name: "미지원 type 0x02", reason: "type", headerHex: "575630010200" + "0000" + "00000000" + "00000000" + "00000000" + "70350000" },
  { name: "상한 초과 (70,000 = 0x11170)", reason: "oversize", headerHex: "575630010100" + "0000" + "00000000" + "00000000" + "00000000" + "70110100" },
] as const;

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
