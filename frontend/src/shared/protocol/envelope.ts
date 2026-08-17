// §3.1 텍스트 Envelope — WS 메시지 카탈로그의 단일 소스이자 G-4(백엔드 합의)의 반영 지점.
// wave0 구계약(session.hello·pose.chunk 등)은 폐기 대상이므로 여기 인용하지 않는다 (I-1 재발 방지).
// 텍스트 Envelope과 바이너리 프레임을 한 메시지에 섞지 않는다 (P0 — CLAUDE.md §2-11).

/** §3.1 — EnvelopeType 14종. 추가·변경은 백엔드 동기화 없이 머지 금지 */
export const ENVELOPE_TYPES = [
  "auth",
  "auth_ok",
  "auth_err",
  "reauth",
  "ping",
  "pong",
  "resume",
  "resume_ok",
  "snapshot",
  "delta",
  "session_pause",
  "session_resume",
  "verdict",
  "error",
] as const;

export type EnvelopeType = (typeof ENVELOPE_TYPES)[number];

/** §3.1 — Envelope 공통 필드. payload는 백엔드 Pydantic 확정 전 unknown 유지 (§0: 타입을 지어내지 않는다) */
export interface Envelope {
  v: number;
  type: EnvelopeType;
  /** u32 · 연결 단위 · 방향별 독립 · 재연결 시 0 리셋 (§2.1.1 「seq·revision·ACK」) */
  seq: number;
  /** 누적 ACK (§2.1.1) */
  ack?: number;
  /** u64 · 세션 단위 · 서버 권위 (§2.1.1) — JS number 정밀도(2^53) 한계로 비교·보관만 하고 산술하지 않는다 */
  revision?: number;
  ts: number;
  payload?: unknown;
}

export function isEnvelopeType(value: unknown): value is EnvelopeType {
  return typeof value === "string" && (ENVELOPE_TYPES as readonly string[]).includes(value);
}

/**
 * 수신 텍스트를 Envelope로 좁힌다. §3.5 수신 가드 원칙에 따라
 * 실패는 예외가 아니라 null — 호출측은 폐기 + 카운터 증가로 처리한다.
 */
export function parseEnvelope(raw: string): Envelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const e = parsed as Record<string, unknown>;
  if (typeof e.v !== "number") return null;
  if (!isEnvelopeType(e.type)) return null;
  if (typeof e.seq !== "number") return null;
  if (typeof e.ts !== "number") return null;
  return e as unknown as Envelope;
}
