// §2.3 WebSocket 상태 전이도 — 상태는 이 8개만 사용한다 (규범 원문 대조 완료, 06 플랜 §4).
// 상태 기계 본체(machine.ts)는 M2에서 구현한다 (선행: G-4). 이 파일은 명칭·타입 준비다.

/** §2.3 — 8상태. 추가·개명 금지 */
export const SOCKET_STATES = [
  "DISCONNECTED", // 초기화 또는 의도적 종료
  "CONNECTING", // intentionalClose=false 리셋 → new WebSocket() → binaryType='arraybuffer' 즉시 설정
  "AUTHENTICATING", // onopen → type:'auth'(티켓) 전송·응답 대기
  "RESUMING", // 재연결의 auth 성공 → resume(lastRevision) 전송·델타 수신
  "CONNECTED", // 동기화 완료 — 업무 송수신·ping/pong 가동·「백오프」 안정 유지 시 attempt=0
  "RECONNECTING", // 정리용 close(intentionalClose=true) 후 백오프 대기
  "RESYNC_FAILED", // resume rejected 또는 재시도 소진 → 신규 세션 재시작 경로
  "FAILED", // 종단 — 자동 재시도 금지, 사용자 개입 대기
] as const;

export type SocketState = (typeof SOCKET_STATES)[number];
