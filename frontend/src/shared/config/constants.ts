// §4 수치 규격 상수 (프로토콜 제외 — 그쪽은 shared/protocol/constants.ts, tsconfig.worker 격리 때문).
// 값의 규범 출처는 설계서 v2.1 — 「규격 이름」·절 번호를 주석으로 남긴다. 매직넘버 금지 (§3 코드 스타일).

// ─── 「하트비트」 (§2.1.3) — 인프라 유휴 타임아웃보다 짧게 유지하는 값. 늘리지 않는다 ───
export const HEARTBEAT_INTERVAL_MS = 15_000; // hidden 상태에서도 동일 주기 유지
export const PONG_TIMEOUT_MS = 5_000; // 1차 미스 확정 시 즉시 재-ping (고정 주기 구현 금지)

// ─── 「백오프」 (§2.1.3) — full jitter: random(0, min(CAP, BASE × 2^attempt)) ───
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_CAP_MS = 30_000;
export const ATTEMPT_RESET_STABLE_MS = 10_000; // CONNECTED 연속 유지 시에만 attempt = 0 (즉시 리셋 금지 — 플래핑)
export const MANUAL_RETRY_BUTTON_AFTER_ATTEMPT = 5; // 네트워크성 실패는 무제한 재시도 + 이후 수동 버튼 노출

// ─── 「핸드셰이크 타임아웃」 (§2.3) — 타임아웃 시 close(4008) 후 RECONNECTING ───
export const CONNECT_TIMEOUT_MS = 10_000;
export const AUTH_TIMEOUT_MS = 5_000;
export const RESUME_TIMEOUT_MS = 3_000;
export const RESUME_MAX_RETRY = 2; // 소진 또는 rejected 수신 시에만 RESYNC_FAILED

// ─── 「티켓·epoch」 (§2.2.4) ───
export const TICKET_TTL_MS = 30_000; // 1회용
export const EPOCH_GRACE_MS = 120_000; // 그 사이 in-band reauth
export const TICKET_CONSECUTIVE_FAIL_LIMIT = 5; // 티켓 실패만의 카운터 → FAILED. 네트워크성 실패와 혼동 금지

// ─── 「종료 코드」 (§2.3.1) — 클라이언트 close는 1000 또는 4000~4999만 ───
export const CLOSE_NORMAL = 1_000;
export const CLOSE_GOING_AWAY = 1_001;
export const CLOSE_NO_STATUS = 1_005; // 브라우저 합성 — 분기에서 intentionalClose 확인 필수
export const CLOSE_ABNORMAL = 1_006; // 실무 최빈 경로 — 분기에서 intentionalClose 확인 필수
export const CLOSE_TICKET_INVALID = 4_001; // 티켓 재발급 후 재접속
export const CLOSE_FORBIDDEN = 4_003; // FAILED — 자동 재시도 금지
export const CLOSE_HANDSHAKE_TIMEOUT = 4_008; // 백오프 재접속
export const CLOSE_PROTOCOL_VIOLATION = 4_009; // FAILED — 자동 재시도 금지

// ─── 「seq·revision·ACK」 (§2.1.1) — ACK는 흐름 확인·유실 계량 전용 (업링크 재전송 없음) ───
export const ACK_EVERY_WINDOWS = 2;
export const ACK_MAX_DELAY_MS = 500;

// ─── 「업링크 백프레셔」 (§4.4.4) ───
export const MAX_PENDING_WINDOWS = 120; // ≈60초분 · 유일한 업링크 버퍼. 초과 시 오래된 것부터 축출 + dropped_window_count
export const SEND_DEFER_BUFFERED_AMOUNT_BYTES = 256 * 1024; // 초과 시 defer (연기는 drop 아님)

// ─── 「라이프사이클 타이머」 (§5.2) ───
export const HIDDEN_GRACE_MS = 30_000; // 초과 시 close + 카메라 정지 + Worker release
export const REVALIDATE_TIMEOUT_MS = 2_000; // 복귀 검증 ping 1회 왕복 — readyState 신뢰 금지
export const FAST_RECONNECT_JITTER_MAX_MS = 250; // bfcache·online 복귀: attempt=0 + 즉시(지터 0~250ms) — 백오프 미경유

// ─── 「카메라 워치독」 (§4.1.2) ───
export const NO_FRAME_TIMEOUT_MS = 2_000; // rVFC 미수신 → CAMERA_STALLED

// ─── 「Worker 타이머」 (§4.3) ───
export const ACQUIRE_DRAIN_TIMEOUT_MS = 200; // terminate 전 in-flight 드레인
export const IDLE_TERMINATE_MS = 30_000; // 세션 중 terminate 금지
export const WORKER_RESPONSE_TIMEOUT_MS = 3_000;
export const WORKER_RECREATE_MAX = 2; // 초과 시 저주기 메인 스레드 강등

// ─── 「모델·오디오」 (§6.2·§4.5.2) ───
export const MODEL_LOAD_BUDGET_MS = 5_000; // 초과 시 진행률 UI + 재시도
export const CUE_MIN_INTERVAL_MS = 2_000; // 디바운스 — 우선순위 안전 > 폼 > 격려
