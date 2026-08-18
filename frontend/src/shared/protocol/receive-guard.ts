// §3.5 수신 계약 — 가드 실패는 예외가 아니라 "프레임 폐기 + 카운터 증가" (P0).
// 예외가 onmessage 밖으로 나가면 소켓은 OPEN인데 처리만 멈추는 무성 행이 된다.
import {
  HEADER_BYTES,
  MAGIC_BYTES,
  MAX_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
  TYPE_POSE_WINDOW,
  WINDOW_PAYLOAD_BYTES,
} from "./constants";
import { readHeader, type FrameHeader } from "./frame-header";

/**
 * 폐기 사유 — 텔레메트리 카운터 키로도 쓴다 (§6.5).
 * 'version'은 폐기에 더해 error 보고 + 새로고침 유도가 필요하다 (§3.2).
 */
export type RejectReason = "short" | "magic" | "version" | "oversize" | "type" | "length";

export interface DecodedFrame {
  header: FrameHeader;
  /** offset 0에서 시작하는 buffer 전제의 무복사 뷰 — 슬라이스된 버퍼를 넘기지 않는다 (§3.5) */
  payload: Float32Array;
}

/**
 * §3.5 진입 가드 전체. 어떤 입력에도 예외를 던지지 않는다 — 실패는 null + onReject(사유).
 * 가드 순서: 길이 하한 → magic → version → 상한 → type → payload_length 정확 일치 → 길이 등식.
 */
export function decodeFrame(buf: ArrayBuffer, onReject?: (reason: RejectReason) => void): DecodedFrame | null {
  const reject = (reason: RejectReason): null => {
    onReject?.(reason);
    return null;
  };

  if (buf.byteLength < HEADER_BYTES) return reject("short");
  const view = new DataView(buf);
  if (
    view.getUint8(0) !== MAGIC_BYTES[0] ||
    view.getUint8(1) !== MAGIC_BYTES[1] ||
    view.getUint8(2) !== MAGIC_BYTES[2]
  ) {
    return reject("magic");
  }
  if (view.getUint8(3) !== PROTOCOL_VERSION) return reject("version");

  // LE 명시 필수 — 생략하면 빅엔디언으로 읽혀 길이 가드가 오동작한다 (§3.5 가드 3)
  const payloadLength = view.getUint32(20, true);
  // 빅엔디안으로 기록된 프레임은 여기서 거대한 값으로 읽혀 상한 가드에 걸린다 (§7.1 거부 벡터)
  if (payloadLength > MAX_PAYLOAD_BYTES) return reject("oversize");

  if (view.getUint8(4) !== TYPE_POSE_WINDOW) return reject("type"); // 0x02~ 예약 (§3.3)
  if (payloadLength !== WINDOW_PAYLOAD_BYTES) return reject("length"); // 정확 일치 등식 (§3.5 가드 2)
  if (HEADER_BYTES + payloadLength !== buf.byteLength) return reject("length");

  return {
    header: readHeader(view),
    // 24B 헤더 = 4의 배수 오프셋이라 무복사 Float32 뷰가 성립한다 (§3.2 정렬 — 바꾸지 말 것)
    payload: new Float32Array(buf, HEADER_BYTES, payloadLength / 4),
  };
}

/** 폐기 카운터 헬퍼 — dropped/reject 계량은 §6.5 관측 지표로 배치 전송한다 */
export function createRejectCounter(): {
  counts: Record<RejectReason, number>;
  onReject: (reason: RejectReason) => void;
} {
  const counts: Record<RejectReason, number> = {
    short: 0,
    magic: 0,
    version: 0,
    oversize: 0,
    type: 0,
    length: 0,
  };
  return {
    counts,
    onReject: (reason) => {
      counts[reason] += 1;
    },
  };
}
