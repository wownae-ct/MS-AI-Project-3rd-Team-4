// §3·§4.4 프로토콜 상수 — 값의 규범 출처는 설계서 v2.1 (「프레임 헤더」·「CANON19 페이로드」·「윈도우 계약」·「수신 상한」).
// 이 파일은 tsconfig.worker 격리 프로젝트에 속한다 — shared/protocol 밖의 모듈을 import하지 않는다 (§6.1).

/** §3.2 — 헤더 크기. 24B 고정이라 payload(Float32) 자연 정렬이 성립한다. 바꾸지 말 것 (P0) */
export const HEADER_BYTES = 24;

/** §3.2 — magic 'W','V','0' */
export const MAGIC_BYTES = [0x57, 0x56, 0x30] as const;

/** §3.2 — 불일치 수신 시 폐기 + error 보고 + 새로고침 유도 */
export const PROTOCOL_VERSION = 1;

/** §3.3 — 현행 유일 메시지 타입. 0x02~0xFF 예약 */
export const TYPE_POSE_WINDOW = 0x01;

/** §3.3 — flags bit0: 보간 프레임 포함 윈도우. 나머지 비트는 송신 0·수신 무시 */
export const FLAG_INTERPOLATED = 0b0000_0001;

/** §4.4.1 — CANON19 관절 수 */
export const CANON19_JOINT_COUNT = 19;

/** §4.4.2 — 채널 [x_norm, y_norm, x_world_m, y_world_m, z_world_m, visibility] */
export const CANON19_CHANNEL_COUNT = 6;

/** §4.4.2 — 프레임당 19관절 × 6채널 × Float32 4B = 456B */
export const BYTES_PER_FRAME = CANON19_JOINT_COUNT * CANON19_CHANNEL_COUNT * 4;

/** §4.4.3 「윈도우 계약」 */
export const WINDOW_DURATION_MS = 1_000;
export const WINDOW_STRIDE_MS = 500;
export const TARGET_FPS = 30;
export const FRAMES_PER_WINDOW = 30;

/** §4.4.3 — 실측 프레임 수/30 이 미만이면 미전송 + dropped_window_count 증가 */
export const MIN_VALID_FRAME_RATIO = 1 / 3;

/** §3.5 — type 0x01의 payload_length 정확 일치 등식: 30 × 456 = 13,680B */
export const WINDOW_PAYLOAD_BYTES = FRAMES_PER_WINDOW * BYTES_PER_FRAME;

/** §3.5 「수신 상한」 — 미래 type 확장 대비 상한 (현행 0x01은 위 정확 일치 가드가 우선) */
export const MAX_PAYLOAD_BYTES = 65_536;
