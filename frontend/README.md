# frontend

React 19 + MediaPipe Pose + 네이티브 WebSocket 기반 AI 홈트레이닝 코치 SPA.
규범은 **프론트엔드 설계서 v2.1**(팀 문서 채널), 실행 계획·현황은 [`docs/plan/06_실행설계플랜.md`](docs/plan/06_실행설계플랜.md).

## 구조 — FSD (설계서 §6.1, 2026-08-17 이관 완료)

```
src/
  app/        진입점·화면 페이즈 조립·전역 스토어 (store/session-store — §1.1 요약/transient 2층)
  pages/      movement-select · session · report — features 조립 지점
  features/
    realtime/    WS 상태 기계·업링크 (M2 본구현 대기 — G-4) + MockWebSocket 테스트 도구
    vision/      카메라 캡처·Worker 래퍼·오버레이 (M3 대기 — G-3)
    rules/       T1 룰 엔진 (rule_params 스키마 대기) + 큐 스케줄러
    entry-guard/ §6.2.1 진입 판정·GuardScreen (인앱/비지원 안내)
  entities/   session · exercise-set · fault-code 도메인 골격
  shared/
    config/    §4 수치 규격 상수 · 인앱 UA 목록 · MediaPipe 경로 — 매직넘버 금지의 단일 출처
    protocol/  §3 단일 소스 — Envelope 14종·24B 헤더 코덱·수신 가드·CANON19·골든 벡터 (DOM 비의존)
    workers/   window-assembler(§4.4.3) · vision.worker(M3) (DOM 비의존 — tsconfig.worker 격리)
    api/       REST 클라이언트 — backend/app/gateway/routers/*와 1:1, 응답 unknown 유지
    lib/       wake-lock(§5.3) · audio-unlock(§4.5.2)
    ui/        디자인 토큰(tokens.css)·공용 컴포넌트 (Button·Banner·Progress·아이콘)
public/mediapipe/  WASM·모델 self-hosting (§6.2 — SHA-256 기준선은 그 안의 README)
```

경계 규칙: 레이어 하향 import만 · features 상호 import 금지 · 슬라이스 밖에서는 `index.ts`만 —
`npm run depcruise`가 강제한다 (§6.1.1).

## 명령

```bash
npm run dev        # 개발 서버
npm run build      # tsc -b(Worker 격리 검사 포함) && vite build
npm test           # vitest
npm run lint       # oxlint
npm run depcruise  # FSD 경계 검사
```

## 계약 동기화

- WS 메시지 카탈로그의 규범은 설계서 §3.1 `EnvelopeType` 14종 (`shared/protocol/envelope.ts`가 단일 소스).
  계약 변경은 백엔드 담당자와 동기화 없이 머지하지 않는다.
- REST 응답 타입은 백엔드 Pydantic 모델 확정 전 `unknown` 유지 — 타입을 지어내지 않는다.

소유 브랜치: `feature/frontend` → PR → `frontend` → PR → `main`.
