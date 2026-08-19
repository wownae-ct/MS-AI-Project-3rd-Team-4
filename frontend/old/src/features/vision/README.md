# features/vision — 카메라 캡처·Worker 래퍼·오버레이 (§4.1~§4.4)

MediaPipe Pose 추론 파이프라인의 메인 스레드 측. **M3에서 구현** (선행: 게이트 G-3).

- 캡처는 **rVFC 단일 경로** — rAF 폴백 금지(P0). rVFC 부재 = 비지원 브라우저 → entry-guard 안내 (§4.1·§6.2.1).
- 프레임 대기열 최대 1 · 모든 캡처 프레임은 생성 경로와 무관하게 **정확히 1회 close()** (§4.1.1, P0).
- Worker는 탭당 1개 싱글턴 (`api/worker-client.ts` 소유) — Pool 금지 (§4.3, P0). 추론 자체는 `shared/workers/vision.worker.ts`.
- 렌더 캔버스는 메인 소유, Worker는 좌표 배열만 반환. 추론용 OffscreenCanvas는 GPU delegate 공식 필수 입력으로 별개 (§4.2).
- 성능 목표는 「추론 SLO」·「메인 프레임 예산」·「카메라 워치독」(설계서 §6.3·§4.1.2) — 값은 `shared/config/constants.ts` 상수만 사용.
  (구판 v0.7의 수치 표기는 폐기됨 — 여기 다시 적지 않는다.)
