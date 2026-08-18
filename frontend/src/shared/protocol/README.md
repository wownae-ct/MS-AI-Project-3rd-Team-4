# shared/protocol — §3 프로토콜 단일 소스

설계서 v2.1 §3(Envelope·바이너리 프레임·수신 가드)과 §4.4(CANON19)의 **타입·상수·코덱 단일 소스**다.

- **DOM 타입 비의존** — `tsconfig.worker.json` 격리 프로젝트가 컴파일 타임에 강제한다. 이 폴더 밖 모듈을 import하지 않는다.
- `ws.send`·소켓 참조를 두지 않는다 — 헤더 작성과 send는 메인 스레드 `features/realtime` 소유 (§4.4.0, P0).
- 골든 벡터(`golden-vectors.ts`)는 손 검산 값이다 — **코덱 출력으로 갱신 금지** (순환 참조, 04 문서 §1).
- `canon19.ts`는 **G-3 확정 전 잠정** — 불일치 시 이 파일만 교체.
- `envelope.ts`는 G-4(백엔드 카탈로그 합의) 반영 지점 — 계약 변경은 백엔드 동기화 없이 머지 금지.

| 파일 | 내용 | 근거 |
|---|---|---|
| `constants.ts` | 헤더·CANON19·윈도우·상한 상수 | §3.2·§4.4 |
| `envelope.ts` | EnvelopeType 14종 · parseEnvelope | §3.1 |
| `frame-header.ts` | 24B 헤더 encode/read (LE) · 송신 전 assert | §3.2·§3.4 |
| `receive-guard.ts` | decodeFrame — 폐기+카운터, 예외 불방출 | §3.5 |
| `canon19.ts` | 33→19 매핑표·채널 정의 (G-3 잠정) | §4.4.1~2 |
| `golden-vectors.ts` | 골든/거부 바이트 벡터 | §7.1 |
