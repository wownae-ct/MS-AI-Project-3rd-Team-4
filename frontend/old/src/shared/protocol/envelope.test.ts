// @vitest-environment node
// §3.1·§3.5 — parseEnvelope 좁히기 완전성: 실패는 null(폐기 경로), 오형 선택 필드도 거부.
import { describe, expect, it } from "vitest";
import { ENVELOPE_TYPES, parseEnvelope } from "./envelope";

const VALID = { v: 1, type: "pong", seq: 3, ts: 123, payload: { nonce: "a" } };

describe("parseEnvelope (§3.1)", () => {
  it("정상 Envelope 수용 — 14종 type 전건", () => {
    for (const type of ENVELOPE_TYPES) {
      expect(parseEnvelope(JSON.stringify({ ...VALID, type }))?.type).toBe(type);
    }
  });

  it("선택 필드 ack·revision — number면 수용", () => {
    const e = parseEnvelope(JSON.stringify({ ...VALID, ack: 7, revision: 42 }));
    expect(e?.ack).toBe(7);
    expect(e?.revision).toBe(42);
  });

  it("실패는 예외가 아니라 null — 비JSON·비객체·필수 필드 결손·미지 type", () => {
    const bad = ["{oops", "42", "null", JSON.stringify({ v: 1 }), JSON.stringify({ ...VALID, type: "sync_full" }), JSON.stringify({ ...VALID, seq: "3" })];
    for (const raw of bad) {
      expect(() => parseEnvelope(raw)).not.toThrow();
      expect(parseEnvelope(raw)).toBeNull();
    }
  });

  it("오형 선택 필드도 거부 — ack: '3' 통과 시 하류 NaN 산술 (개선권장 회귀)", () => {
    expect(parseEnvelope(JSON.stringify({ ...VALID, ack: "3" }))).toBeNull();
    expect(parseEnvelope(JSON.stringify({ ...VALID, revision: "9" }))).toBeNull();
  });
});
