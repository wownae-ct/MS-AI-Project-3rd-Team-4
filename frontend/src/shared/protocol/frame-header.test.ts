// @vitest-environment node
// §7.1 — 헤더 코덱 라운드트립. 기준은 골든 벡터(손 검산)이며 코덱 출력이 아니다 (순환 참조 금지).
import { describe, expect, it } from "vitest";
import { encodeHeader, readHeader } from "./frame-header";
import { bytesToHex, GOLDEN_VECTORS, hexToBytes } from "./golden-vectors";
import { HEADER_BYTES, WINDOW_PAYLOAD_BYTES } from "./constants";

describe("encodeHeader — 골든 벡터 일치 (§3.2·§7.1)", () => {
  for (const g of GOLDEN_VECTORS) {
    it(g.name, () => {
      const encoded = new Uint8Array(encodeHeader(g.meta));
      expect(encoded.byteLength).toBe(HEADER_BYTES);
      expect(bytesToHex(encoded)).toBe(g.headerHex);
    });
  }
});

describe("readHeader — 골든 헤더 필드 복원", () => {
  for (const g of GOLDEN_VECTORS) {
    it(g.name, () => {
      const bytes = hexToBytes(g.headerHex);
      const header = readHeader(new DataView(bytes.buffer));
      expect(header.setIndex).toBe(g.meta.setIndex);
      expect(header.seq).toBe(g.meta.seq);
      expect(header.windowIndex).toBe(g.meta.windowIndex);
      expect(header.tOffsetMs).toBe(g.meta.tOffsetMs);
      expect(header.interpolated).toBe(g.meta.interpolated);
      expect(header.payloadLength).toBe(WINDOW_PAYLOAD_BYTES);
    });
  }
});

describe("송신 전 범위 assert (§3.4 — 무성 절단 차단)", () => {
  const base = { setIndex: 0, seq: 0, windowIndex: 0, tOffsetMs: 0, interpolated: false };

  it("Date.now() 규모 값(≈1.787e12)은 RangeError — mod 2^32 무성 절단을 조기 검출", () => {
    expect(() => encodeHeader({ ...base, tOffsetMs: 1_787_000_000_000 })).toThrow(RangeError);
  });

  it("음수·비정수·u16/u32 상한 초과 전부 RangeError", () => {
    expect(() => encodeHeader({ ...base, tOffsetMs: -1 })).toThrow(RangeError);
    expect(() => encodeHeader({ ...base, tOffsetMs: 1.5 })).toThrow(RangeError);
    expect(() => encodeHeader({ ...base, tOffsetMs: 2 ** 32 })).toThrow(RangeError);
    expect(() => encodeHeader({ ...base, seq: 2 ** 32 })).toThrow(RangeError);
    expect(() => encodeHeader({ ...base, setIndex: 2 ** 16 })).toThrow(RangeError);
    expect(() => encodeHeader({ ...base, windowIndex: 2 ** 32 })).toThrow(RangeError);
  });

  it("경계값(상한-1)은 통과", () => {
    expect(() =>
      encodeHeader({ setIndex: 65_535, seq: 2 ** 32 - 1, windowIndex: 2 ** 32 - 1, tOffsetMs: 2 ** 32 - 1, interpolated: false }),
    ).not.toThrow();
  });
});
