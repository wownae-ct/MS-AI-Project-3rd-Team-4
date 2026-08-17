# 디렉토리 구조 — FSD 레이어·슬라이스 지도

> 근거: 설계서 v2.1 §6.1 (FSD 확정, 2026-08-14 사용자 지시). 운영 규칙의 SSOT는 `.claude/skills/directory-placement`,
> 이관 실행 계획은 `docs/plan/04_FSD_이관계획.md`. 이 문서는 사람용 지도다.

## 1. 목표 구조 (M1 이관 후)

```
frontend/src/
├─ app/                    # 진입점·프로바이더·전역 스토어 조립 — features 간 조립도 여기서만
├─ pages/                  # 화면 3종: movement-select · session · report
├─ features/
│  ├─ vision/              # 카메라·캡처·오버레이·Worker 래퍼 (Worker 본체는 shared/workers)
│  ├─ realtime/            # WS 8상태 머신·인증·resume·하트비트 — 헤더 작성+send의 소유자
│  ├─ rules/               # T1 룰 엔진 (순수 함수) · rule_params 확보 경로
│  └─ entry-guard/         # 인앱 브라우저 감지·탈출 유도·비지원 안내
├─ entities/               # 도메인 모델: session · exercise-set · fault-code
└─ shared/
   ├─ ui/                  # 범용 컴포넌트 (도메인 무지)
   ├─ lib/                 # 유틸
   ├─ config/              # 상수 — 수치 규격·감지 UA 목록의 코드상 위치 (값의 출처는 CLAUDE.md §4)
   ├─ api/                 # REST 클라이언트 — backend/app/gateway/routers/* 와 1:1
   ├─ protocol/            # §3 전체의 단일 소스: Envelope 타입·24B 헤더 코덱·수신 가드·골든 벡터 (DOM 비의존)
   └─ workers/             # vision.worker.ts — shared/protocol만 import 가능 (DOM 비의존)
```

## 2. import 규칙 (§6.1.1 — depcruise가 CI에서 차단)

1. **레이어 하향만**: `app → pages → features → entities → shared`. 역방향 즉시 위반.
2. **features 상호 import 금지** — vision↔rules↔realtime의 조립은 `app/`에서만.
3. **슬라이스 밖에서는 `index.ts` public API만** — 내부 경로 심층 import 금지.
4. **`shared/workers`는 `shared/protocol`만 import** — 두 폴더 모두 DOM 타입 비의존 (tsconfig.worker의 lib 제한이 1차 검사, depcruise `worker-no-dom`이 보조).

왜 이렇게 엄격한가: Worker·프로토콜 코드에 DOM 의존이 스며들면 Worker 번들이 조용히 깨지거나
메인 전용 API를 Worker에서 호출하는 런타임 오류가 난다. 타입 수준(tsconfig 분리)과
그래프 수준(depcruise)의 이중 게이트가 그 예방책이다.

## 3. 현재 상태와 이관 매핑 (M1 전)

현재는 평면 구조(`src/{pose,rules,api,ws,ui}` + `App.tsx`/`main.tsx`)이며 **이관 전**이다.

| 현재 | 이관 후 | 주의 |
|---|---|---|
| `App.tsx`·`main.tsx`·`App.test.tsx` | `app/` | setupTests는 루트 유지 가능 |
| `api/*` | `shared/api/` | 라우터 1:1 유지, 개선(credentials 등)은 M2 |
| `ws/client.ts` | `features/realtime/` | **이관이 아니라 재작성** — 현행은 구계약(wave0) 뼈대 |
| `pose/` | `features/vision/` + `shared/workers/` | README 수치가 구판 — 이관 시 갱신 |
| `rules/` | `features/rules/` | 〃 |
| `ui/` | `pages/` + `shared/ui/` | 화면 조립은 pages, 범용만 shared/ui |

이관 원칙: **파일 이동 PR에 동작 변경을 섞지 않는다** (리뷰 가능성). 실행 순서·게이트는 `docs/plan/04_FSD_이관계획.md`.

## 4. 자주 틀리는 배치 판단

- "WS로 보내는 헤더 코덱이니 realtime에?" → **아니다.** 코덱·가드·골든 벡터는 `shared/protocol`(DOM·소켓 비의존 순수 코드), **소켓 참조와 send는 `features/realtime`**. `shared/protocol`에 `ws.send`가 보이면 잘못된 것이다 (P0-14).
- "감지 UA 목록은 entry-guard 안에?" → 상수는 `shared/config`, 판정 로직은 `features/entry-guard` (§6.2.1).
- "룰 판정 결과를 vision이 바로 쓰고 싶다" → features 상호 import 금지. `app/`이 조립하거나 스토어 경유.
- 새 수치가 필요하다 → 코드에 리터럴 금지. `shared/config` 상수로 선언하고 값의 근거는 CLAUDE.md §4 규격 이름을 주석으로.
