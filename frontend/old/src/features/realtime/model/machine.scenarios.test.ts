// §7.2 상태 기계 시나리오 하네스 (04 문서 §2 S1~S9) — M2 준비 단계.
// 상태 기계(machine.ts) 구현은 게이트 G-4 합의 후 착수한다 — 그 전까지 시나리오는 todo로 고정해
// 구현 시작 시점에 전건을 채운다. 임계·횟수의 규범값은 shared/config/constants.ts 상수만 사용할 것.
// 전제 도구: vi.useFakeTimers() + testing/mock-websocket.ts (도구 자체는 자체 테스트로 검증됨).
import { describe, it } from "vitest";

describe("§7.2 상태 기계 시나리오 — G-4 합의 후 구현과 함께 채운다", () => {
  it.todo("S1: AUTH_TIMEOUT·RESUME_TIMEOUT 발화 → 정확한 전이 (RESUME은 재시도 소진 후에만 RESYNC_FAILED)");
  it.todo("S2: 1006 수신 — intentionalClose=false면 백오프 재접속 / true면 재접속 없음 (§2.3.2 규칙 ②)");
  it.todo("S3: 4003 수신 → FAILED 잔류, 재시도 0회 (SM-7: 도착 상태 무관)");
  it.todo("S4: CONNECTING 진입 후 1000 종료 → 플래그 리셋 확인 — 재접속 대상 (§2.3.2 규칙 ③)");
  it.todo("S5: offline→online · pageshow(persisted) → attempt 리셋 + 즉시 재연결, 백오프 미경유 (SM-6)");
  it.todo("S6: resume 'rejected' 수신 → RESYNC_FAILED → 신규 세션 (§2.1)");
  it.todo("S7: 연속 티켓 실패/네트워크성 실패 각 한도 도달 → FAILED / FAILED 아님(수동 버튼) — 카운터 별개 (SM-4)");
  it.todo("S8: hidden 유예 초과 close 후 → hidden 중 재연결 시도 0회 (§7.5 P0)");
  it.todo("S9: 하트비트 1차 미스 → 즉시 재-ping(고정 주기 아님) · 최악 감지 시간 내 (「하트비트」)");
});
