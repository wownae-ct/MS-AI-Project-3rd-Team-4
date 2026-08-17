# shared/workers — Worker 전용 코드 (M3)

`vision.worker.ts`(추론 루프·CANON19 축약·윈도우 조립 §4.2~§4.4)가 M3에서 들어온다.

- **DOM 타입 비의존** — `tsconfig.worker.json` 격리 프로젝트가 강제. import는 `shared/protocol`만 (§6.1.1).
- Worker 인스턴스화·수명 관리는 `features/vision/api/worker-client.ts` 소유 (§4.3).
- 메인↔Worker 메시지 계약은 `messages.ts`(M3) — transferable 규약 포함.
