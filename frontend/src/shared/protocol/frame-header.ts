// §3.2 24바이트 헤더 인코더/디코더 — 리틀엔디언. 레이아웃 변경 금지 (P0).
// 헤더 작성과 ws.send는 메인 스레드 features/realtime 소유 (§4.4.0) — Worker에서 encodeHeader를 호출하지 않는다.
import {
  FLAG_INTERPOLATED,
  HEADER_BYTES,
  MAGIC_BYTES,
  PROTOCOL_VERSION,
  TYPE_POSE_WINDOW,
  WINDOW_PAYLOAD_BYTES,
} from "./constants";

/** 헤더 메타 — 필드 전부 메인 소유 (§4.4.0: seq는 소켓 상태, set/window index는 세션 상태) */
export interface FrameHeaderMeta {
  /** u16 — 세트 번호 */
  setIndex: number;
  /** u32 — 연결 단위·방향별 독립 (§2.1.1) */
  seq: number;
  /** u32 — 멱등 키 UQ(session_id, set_index, window_index)의 일부. session_id는 헤더에 싣지 않는다 (§3.2) */
  windowIndex: number;
  /** u32 — session_epoch 기준 단조 경과 ms (§3.4). Date.now() 대입 금지 — mod 2^32 무성 절단 */
  tOffsetMs: number;
  /** §3.3 flags bit0 — 보간 프레임 포함 윈도우 */
  interpolated: boolean;
}

export interface FrameHeader {
  version: number;
  type: number;
  flags: number;
  interpolated: boolean;
  setIndex: number;
  seq: number;
  windowIndex: number;
  tOffsetMs: number;
  payloadLength: number;
}

const U16_RANGE = 0x1_0000;
const U32_RANGE = 0x1_0000_0000;

// §3.4 — setUint32는 범위 밖 값을 예외 없이 mod 2^32 절단한다(무성 손상).
// 송신 전 정수·범위를 단언해 절단을 조기 검출한다.
function assertUint(name: string, value: number, range: number): void {
  if (!Number.isInteger(value) || value < 0 || value >= range) {
    throw new RangeError(`${name}=${value}: 0 <= 정수 < ${range} 위반 (§3.4 송신 전 assert)`);
  }
}

/** §3.2 오프셋 표 그대로 24B 헤더를 만든다. payload와 분리 제공한다 (§4.4.0). */
export function encodeHeader(meta: FrameHeaderMeta, payloadLength: number = WINDOW_PAYLOAD_BYTES): ArrayBuffer {
  assertUint("setIndex", meta.setIndex, U16_RANGE);
  assertUint("seq", meta.seq, U32_RANGE);
  assertUint("windowIndex", meta.windowIndex, U32_RANGE);
  assertUint("tOffsetMs", meta.tOffsetMs, U32_RANGE);
  assertUint("payloadLength", payloadLength, U32_RANGE);

  const buf = new ArrayBuffer(HEADER_BYTES);
  const view = new DataView(buf);
  view.setUint8(0, MAGIC_BYTES[0]);
  view.setUint8(1, MAGIC_BYTES[1]);
  view.setUint8(2, MAGIC_BYTES[2]);
  view.setUint8(3, PROTOCOL_VERSION);
  view.setUint8(4, TYPE_POSE_WINDOW);
  view.setUint8(5, meta.interpolated ? FLAG_INTERPOLATED : 0);
  // DataView 기본은 빅엔디언 — 모든 다바이트 접근에 littleEndian = true 명시 (§3.5 가드 3)
  view.setUint16(6, meta.setIndex, true);
  view.setUint32(8, meta.seq, true);
  view.setUint32(12, meta.windowIndex, true);
  view.setUint32(16, meta.tOffsetMs, true);
  view.setUint32(20, payloadLength, true);
  return buf;
}

/** 가드 통과가 전제인 저수준 리더 — 진입 검증은 receive-guard.decodeFrame이 담당한다 (§3.5) */
export function readHeader(view: DataView): FrameHeader {
  const flags = view.getUint8(5);
  return {
    version: view.getUint8(3),
    type: view.getUint8(4),
    flags,
    interpolated: (flags & FLAG_INTERPOLATED) !== 0,
    setIndex: view.getUint16(6, true),
    seq: view.getUint32(8, true),
    windowIndex: view.getUint32(12, true),
    tOffsetMs: view.getUint32(16, true),
    payloadLength: view.getUint32(20, true),
  };
}
