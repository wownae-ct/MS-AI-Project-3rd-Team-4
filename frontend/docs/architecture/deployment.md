# 배포·환경 — SWA·환경별 빌드·CSP·진입 경로

> 근거: 설계서 v2.1 §6.2(자산·진입) · §6.4(배포). 실측 환경값은 `docs/plan/09_Azure_환경실측.md`,
> CI 관련 오픈 이슈는 `docs/plan/08_리스크_오픈이슈.md` (I-2·I-8·I-9).

## 1. 배포 토폴로지

- 정적 산출물 → **Azure Static Web Apps** (확정 전제 ③ — 호스팅 전환 제안은 구현하지 말고 개정 절차 안내).
- 배포 파이프라인: `frontend-ci.yml` (frontend 브랜치 push 시). **CI 파일은 CI·인프라 담당 영역 — 프론트에서 수정 금지.**
  빌드는 러너에서 직접 하고 SWA 액션은 업로드만 한다 (Oryx 컨테이너에는 VITE_* env가 전달되지 않기 때문 — CI 파일 주석 참조).
- WS는 SWA를 경유하지 않는다 — AKS ingress-nginx 직결. 하트비트 규격이 인프라 유휴 타임아웃보다 짧은 이유가 이 경로에 있다.

## 2. 환경별 빌드 — 런타임 스위칭 금지 (§6.4)

- `VITE_API_BASE`는 **빌드타임 정적 치환** — 산출물에 값이 박힌다. 환경(prod/staging)별로 **별도 빌드**가 전제.
- 코드에서 런타임 API 오리진 스위칭(호스트명 보고 분기 등)을 **만들지 않는다** — "staging에서는 되던데" 류 환경 분기 버그의 뿌리.
- 실측 확정값(2026-08-17): prod = `https://aicoach-production.koreacentral.cloudapp.azure.com` (WS는 동일 호스트 `wss://`).
  **staging 값은 미확정** (I-9 — 인프라 확인 대기).

## 3. staticwebapp.config.json (§6.4.1 — 미작성, M5 전)

필수 구성 3종 — 없으면 각각 명확한 장애가 난다:
| 구성 | 없으면 |
|---|---|
| `navigationFallback` | SPA 딥링크 새로고침 404 |
| mimeTypes (`.wasm`·`.task`) | MediaPipe 자산 로드 실패 (콘텐츠 타입 거부) |
| CSP 헤더 (`wasm-unsafe-eval`·connect-src에 API/WS 호스트) | WASM 실행 차단·WS 연결 차단 |

CSP의 API 호스트 값은 해당 빌드의 `VITE_API_BASE`와 동일해야 한다 — 환경별 산출물 전제와 연동 (`docs/plan/03_툴체인_정비계획.md` §6).

## 4. 자산 self-hosting (§6.2, P0-10)

- MediaPipe WASM·`.task` 모델은 `public/mediapipe/` 하위 self-hosting — **CDN 하드코딩 금지**.
  이유: CDN 장애·차단(사내망/국가별)·버전 드리프트가 앱 코어 기능을 죽이는 외부 의존이 된다. SHA-256 해시 기록.
- 모델 로드는 예산 내 진행률 UI + 재시도 (「모델·오디오」).

## 5. 진입 경로 가드 (§6.2.1, P0-16)

- **인앱 브라우저(카카오톡 등) 감지 시 세션 시작 차단 + 외부 브라우저 유도.**
  getUserMedia 재시도 루프·자동 새로고침 금지 — Kakao 공식 답변상 reload로 복구 불가.
- 탈출 경로는 3단: 카카오 스킴 → intent → **URL 복사 (상시 병행하는 최후 경로)** — 스킴은 비공식 패턴이라 언제든 막힐 수 있다 (리스크 R-3).
- iOS·Safari·Firefox·rVFC 부재 = 비지원 안내 화면 (확정 전제 ① — Safari 대응 제안은 구현하지 않는다).
- 상세 규칙: `.claude/skills/entry-guard`.

## 6. 관측 (§6.5)

지표 9종을 배치 전송, `sendBeacon`은 hidden 최종 플러시만 (「관측 지표」).
수신 경로는 백엔드/App Insights 협의 대상 (`team4hc-appi` 실존 — 09 문서).
