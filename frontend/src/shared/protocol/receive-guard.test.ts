// §7.1 거부 테스트 — 모든 실패가 "폐기 + 카운터, 예외 불방출"인지 전건 단언한다 (§3.5 P0).
import { describe, expect, it } from "vitest";
import { createRejectCounter, decodeFrame } from "./receive-guard";
import { GOLDEN_VECTORS, hexToBytes, REJECT_VECTORS } from "./golden-vectors";
import { HEADER_BYTES, WINDOW_PAYLOAD_BYTES } from "./constants";

/** 헤더 hex + payload를 offset 0 단일 버퍼로 조립 (수신 프레임 재현) */
function buildFrame(headerHex: string, payloadBytes: number = WINDOW_PAYLOAD_BYTES): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER_BYTES + payloadBytes);
  new Uint8Array(buf).set(hexToBytes(headerHex), 0);
  return buf;
}

describe("정상 프레임 수용 (§3.5)", () => {
  for (const g of GOLDEN_VECTORS) {
    it(g.name, () => {
      const frame = buildFrame(g.headerHex);
      const decoded = decodeFrame(frame);
      expect(decoded).not.toBeNull();
      expect(decoded?.header.seq).toBe(g.meta.seq);
      expect(decoded?.payload.length).toBe(WINDOW_PAYLOAD_BYTES / 4);
    });
  }

  it("payload는 무복사 Float32 뷰 — 기록 값이 그대로 읽힌다 (§3.2 정렬)", () => {
    const frame = buildFrame(GOLDEN_VECTORS[0].headerHex);
    new DataView(frame).setFloat32(HEADER_BYTES, 0.5, true);
    const decoded = decodeFrame(frame);
    expect(decoded?.payload[0]).toBeCloseTo(0.5);
  });
});

describe("거부 벡터 전건 — 폐기 + 카운터 + 예외 불방출 (§7.1)", () => {
  for (const r of REJECT_VECTORS) {
    it(`${r.name} → reason '${r.reason}'`, () => {
      const { counts, onReject } = createRejectCounter();
      // 길이 등식 위반 벡터는 payload_length와 어긋난 실길이를 그대로 재현한다
      const frame = buildFrame(r.headerHex);
      let decoded: ReturnType<typeof decodeFrame> = null;
      expect(() => {
        decoded = decodeFrame(frame, onReject);
      }).not.toThrow();
      expect(decoded).toBeNull();
      expect(counts[r.reason]).toBe(1);
    });
  }

  it("byteLength < 24 → 'short'", () => {
    const { counts, onReject } = createRejectCounter();
    expect(decodeFrame(new ArrayBuffer(10), onReject)).toBeNull();
    expect(counts.short).toBe(1);
  });

  it("payload_length는 맞지만 실제 버퍼가 더 긴 경우 → 'length' (등식 위반)", () => {
    const { counts, onReject } = createRejectCounter();
    const frame = buildFrame(GOLDEN_VECTORS[0].headerHex, WINDOW_PAYLOAD_BYTES + 4);
    expect(decodeFrame(frame, onReject)).toBeNull();
    expect(counts.length).toBe(1);
  });

  it("임의 쓰레기 버퍼에도 예외를 던지지 않는다 (무성 행 방지)", () => {
    const garbage = [new ArrayBuffer(0), new ArrayBuffer(23), new ArrayBuffer(1_000)];
    const noisy = new ArrayBuffer(64);
    new Uint8Array(noisy).fill(0xff);
    garbage.push(noisy);
    for (const buf of garbage) {
      expect(() => decodeFrame(buf)).not.toThrow();
      expect(decodeFrame(buf)).toBeNull();
    }
  });
});
