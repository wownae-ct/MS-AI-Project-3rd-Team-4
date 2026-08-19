# 테스트 가이드 — 실행·작성·자산 지도

> 운영 기준의 SSOT는 `.claude/skills/frontend-testing`(로컬). 테스트 자산의 목록·생성 절차는
> [plan/04_검증_수용기준.md](../plan/04_검증_수용기준.md). 이 문서는 사람용 요약이다.

## 1. 실행

```bash
cd frontend
npm test                            # vitest run (전체)
npx vitest run src/App.test.tsx     # 단일 파일
npx vitest run -t "테스트 이름"      # 이름 매칭
npm run build                       # 타입검사 포함 — 테스트 전 통과 확인 습관
npm run depcruise                   # FSD 경계·순환 의존 검사 (§6.1.1)
```

검증 순서 관례: 타입검사 → 린트 → 테스트 (`/verify` 스킬이 이 순서를 자동화).

## 2. 작성 관례

- 배치: **대상 파일 옆** `*.test.ts(x)`. 폴더에 README가 있으면 함께 갱신.
- 환경: Vitest + Testing Library + jsdom 기본. **DOM이 필요 없는 순수 로직 테스트에는 파일 첫 줄에
  `// @vitest-environment node`** — jsdom 기동 비용을 아낀다 (protocol·workers·lib 테스트가 이 관례를 따름).
- 타이머 의존 로직(하트비트·백오프·유예)은 `vi.useFakeTimers()` 전제 — 실제 시간 대기 금지.
- 외부 경계는 목킹: WebSocket → MockWebSocket, MediaPipe → 랜드마크 픽스처, Worker → 메시지 계약 수준.

## 3. 테스트 자산 지도 (마일스톤별)

| 자산 | 무엇을 지키는가 | 위치 | 상태 (2026-08-17) |
|---|---|---|---|
| **골든 바이트 벡터** | 24B 헤더 코덱 회귀 — 골든이 기준, 코덱 출력으로 골든 갱신 금지(순환 참조) | `shared/protocol/golden-vectors.ts` | ✅ M1 구현 (3종 + 테스트) |
| **거부 벡터** | 수신 가드 — 폐기+카운터, 예외 불방출 확인 | 〃 | ✅ M1 구현 (6종+α) |
| **윈도우 계약 합성 입력** | §4.4.3 리샘플·저프레임(12fps/8fps)·격자·축출 | `shared/workers/window-assembler.test.ts` | ✅ 구현 (13건) |
| **MockWebSocket + 시나리오 S1~S9** | 8상태 머신·intentionalClose·백오프·고속 복귀 경로 | `features/realtime/testing/` + `model/machine.scenarios.test.ts` | 🟡 도구 완성(자체 테스트 9건) · S1~S9는 todo — M2 본구현과 함께 채움 |
| **랜드마크 픽스처** | 룰 판정 결정론 — G-3(CANON19 매핑) 확정 후에만 제작 (선제작 금지) | `features/rules/` 옆 | ⬜ G-3 대기 |
| **rule_params 주입 테스트** | REST 실패 시 3단 강등 경로 + 배너 | 〃 | ⬜ 스키마 대기 |
| **Playwright 합성 세션** | 가짜 카메라(y4m)로 프레임 드롭·롱태스크 스모크 | e2e (CI 협의) | ⬜ M5 |

## 4. 수용 기준과의 연동

P0/P1 수용 기준(설계서 §7.5) ↔ 검증 수단 매핑 추적표는 [plan/04_검증_수용기준.md](../plan/04_검증_수용기준.md) §6이 대장이다.
새 테스트가 §7.5 항목을 커버하면 그 표를 갱신한다 — "테스트는 있는데 어느 기준을 지키는지 모르는" 상태 방지.

## 5. 함정

- MediaPipe 버전 업그레이드는 §7.3 회귀(고정 입력 영상에서 좌표 편차 임계 확인) 없이 락파일을 갱신하지 않는다.
- 실기 전용 항목(Wake Lock 화면 유지, 인앱 탈출, 12h t_offset 단조성)은 단위 테스트로 대체 불가 — 실기 매트릭스(설계서 부록 D.3)에 남긴다.
- 테스트에서 수치가 필요하면 `shared/config` 상수를 import — 테스트에 리터럴을 다시 적으면 상수 변경 시 테스트가 규격을 못 지킨다.
