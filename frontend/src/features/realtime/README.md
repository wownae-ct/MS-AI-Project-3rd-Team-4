# features/realtime — WS 통신·재동기화 (§2·§3 송신측)

세션 WebSocket의 상태 기계·인증·재동기화·하트비트·업링크를 담당한다. **M2에서 구현** (선행: 게이트 G-4).

- **메시지 카탈로그의 규범은 §3.1 `EnvelopeType` 14종** (`shared/protocol/envelope.ts`가 단일 소스).
  구계약(wave0: `session.hello`·`pose.chunk` 등)은 폐기 대상 — 새 코드·주석에서 인용 금지 (I-1 재발 방지).
- 현재 `model/client.ts`는 구계약 시절 뼈대다 — **M2에서 8상태 기계로 재작성**한다 (동작 유지 상태로 이관만 됨).
- 24B 헤더 작성과 `ws.send`는 이 슬라이스(메인 스레드) 소유다 (§4.4.0, P0).
- 상태 기계 설계는 `frontend/docs/plan/06_실행설계플랜.md` §4 (SM-1~SM-7), 규격 값은 루트 `.claude/CLAUDE.md` §4 →
  코드에서는 `shared/config/constants.ts`·`shared/protocol/constants.ts` 상수만 사용한다.
- 테스트: `testing/mock-websocket.ts`(M2)로 §7.2 시나리오 S1~S9 전건 자동화.
