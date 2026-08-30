# frontend

React 19 + TypeScript 7 + Vite 8 + Tailwind CSS v4 + Base UI. 메리맵(MarryMap — 웨딩 예산·타임라인·상담) 프론트엔드.

**S0~S6 전 화면 + AI상담 + 설정(⚙️)까지 실API 배선 완료.** `src/pages/`에 10개 슬라이스(login ·
onboarding · dashboard · category · timeline · report · budget · chat · settings · style-guide)가
있고 전부 실제 백엔드에 연결돼 있다 — "디자인 시스템 기반 + 스타일가이드 1화면만" 있던 시절은
지났다. 화면 6개의 시각 스펙은 [`docs/mockups/`](docs/mockups/README.md)에, 앱 셸·라우트 계약은
[`docs/design/layout.md`](docs/design/layout.md)에 있다.

문서 지도는 [`docs/README.md`](docs/README.md). 자주 찾는 것:

| 필요 | 문서 |
|---|---|
| 색 · 서체 · 형태 · 접근성 규범과 근거 (SSOT) | [`docs/design/`](docs/design/README.md) — 결정은 [decisions.md](docs/design/decisions.md) |
| 토큰 → 유틸리티 매핑 · 코드 규약 · 게이트 | [`src/shared/ui/README.md`](src/shared/ui/README.md) |
| 툴체인 결정 · 버전 · CI 게이트 · 실측 기준선 | [`docs/architecture/toolchain.md`](docs/architecture/toolchain.md) |
| 레이어 · 별칭 · 경계 강제 | [`docs/architecture/layers.md`](docs/architecture/layers.md) |
| 백엔드 연동 현황 · API 계약 · 챗 스트리밍 | [`docs/architecture/integration-status.md`](docs/architecture/integration-status.md) · [`backend-integration.md`](docs/architecture/backend-integration.md) · [`api-contract.md`](docs/architecture/api-contract.md) · [`chat-streaming.md`](docs/architecture/chat-streaming.md) |
| 왜 이렇게 정했나 | [`docs/adr/`](docs/adr/README.md) |

## 시작하기

```bash
npm ci        # 최초 1회. engine-strict=true 라 Node 하한(^24.15.0) 미달이면 여기서 실패한다 — 의도된 동작
npm run dev   # 개발 서버
```

**Node 버전은 [`.nvmrc`](.nvmrc)가 단일 출처다** (`24.19.0`). 하한은 `package.json`의 `engines`(`^24.15.0`)이며 근거는 `jsdom`의 요구사항이다 — [toolchain §2](docs/architecture/toolchain.md#2-런타임--node-24-단일화).

> `nvm-windows`는 `.nvmrc`를 읽지 못하므로 버전을 직접 지정해야 한다(`nvm use 24.19.0`). `fnm`은 읽는다. CI는 `node-version-file`로 자동 참조한다.

## 명령

| 명령 | 내용 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run typecheck` | `tsc -b` — 타입 검사만 |
| `npm run lint` | `oxlint --deny-warnings .` — 코드 품질 + **FSD 레이어 경계 강제** + 접근성(jsx-a11y) |
| `npm test` | `vitest run` — 화면 테스트 + **게이트 픽스처**(`scripts/lib/__tests__/`). 커버리지 측정과 E2E는 아직 없다 |
| `npm run build` | `tsc -b && vite build && node scripts/check-bundle-budget.mjs` — 마지막 단계가 **번들 예산 + 디자인 규범 게이트**다 |
| `npm run preview -- --host 127.0.0.1` | 빌드 산출물 서빙. **`--host` 필수** — 기본은 `[::1]`만 listen 해서 `127.0.0.1`로는 연결이 거부된다 |

**검증 게이트는 4개다** — `typecheck → lint → test → build`. 커밋 전 전부 돌린다. CI도 같은 순서로 실행한다.

### `build` 끝의 게이트가 막는 것

[`scripts/check-bundle-budget.mjs`](scripts/check-bundle-budget.mjs)가 산출물을 디스크에서 읽어 검사한다. 예산(JS gzip · 최대 청크 · CSS gzip(@font-face 제외) · 폰트 raw)과 **디자인 규범** — 그림자·링, 팔레트 밖 색, 토큰 밖 라운드, 다크모드, `theme.css` 폐기 선언 유지, 그리고 소스의 색 임의값·`ring-*`·그림자 토큰(`file:line`). 검사 본체는 [`scripts/lib/`](scripts/lib/)의 순수 모듈이고 픽스처가 `npm test`에서 돈다. 상세는 [`src/shared/ui/README.md` 「게이트」](src/shared/ui/README.md#게이트).

위반이면 exit 1 이고 **우회 플래그가 없다.** 새 색·라운드가 필요하면 [decisions.md](docs/design/decisions.md) → `theme.css` 순서로 넣으면 화이트리스트가 자동으로 따라온다.

## 구조 — Feature-Sliced Design

```
src/
  app/          App.tsx(RouterProvider) · main.tsx · router/router.tsx(코드 기반 라우트 트리 ·
                pathless 가드 2층: _authed 가 세션만, _shell 이 웨딩만 판정) · ui/AppShell.tsx
                (탭바↔사이드바)
  pages/
    login/        S0 — 이메일/비밀번호 + 소셜 로그인 버튼(구글·네이버 라이브, 카카오·애플은
                   백엔드 머지 보류라 버튼만 노출)
    onboarding/   S1 — 9단계. 카테고리 선택 + 예산 배분을 POST /weddings 한 번으로 전송
    dashboard/    S2 — 첫 화면이라 정적 import(초기 청크)
    category/     S3 — 카테고리별 체크리스트 진행률 + 시세 비교, 인용 뱃지
    timeline/     S4
    report/       S5 — 예산 3분할은 카드 폭에 따라 컨테이너 쿼리로 적층된다
    budget/       S6 — 결제 CRUD(수정/삭제/환불) + 영수증 사진 OCR 자동입력 + 벤치마크 카드
    chat/         AI상담 — SSE 스트리밍, 근거 인용, 세션 목록, 메시지 평점
    settings/     로그아웃만 실동작. "비밀번호 변경"·"온보딩 다시하기"는 확정된 "준비 중" 플레이스홀더
    style-guide/  디자인 시스템 라이브 문서 — 토큰·프리미티브·규범이 실제로 동작하는지 눈으로 검증하는 실체
  entities/
    chat · checklist · dashboard · feedback · payment · personalization · session · timeline ·
    vendor-case · wedding — 도메인별 타입 + API 래퍼의 단일 출처(`shared/api`가 아니라 여기서
    응답 타입을 좁힌다)
  shared/
    api/          client.ts(fetch 유일 호출 지점) · env.ts(VITE_API_BASE, 최초 사용 시점 lazy
                  검증) · contract.ts(백엔드 어휘 사본 — 카테고리 9 · 지역 17 · 티어 4 · verdict
                  4, 개수로 드리프트 감지)
    lib/          순수 함수 유틸(부활 — 한때 삭제됐다가 다시 생겼다)
    ui/           styles.css(유일한 CSS 진입점) · theme.css(@theme 토큰) · Button · Card ·
                  Badge · Money · Progress · Tabs · Select · DateField · ErrorBoundary 등
                  30개 프리미티브
    assets/       브랜드 에셋
public/
  staticwebapp.config.json  SWA 가 읽는 배포 설정 — Vite 가 dist/ 루트로 복사한다(SPA 폴백 · 자산 캐시 · CSP)
scripts/
  check-bundle-budget.mjs   build 끝 게이트 (오케스트레이터 — 예산 · 규범 · 폐기 유지 · 배포 설정)
  lib/                       css-norms · source-norms · deploy-config (순수 모듈) · __tests__/(픽스처 · 폐기 계약 · 유령 후보 · 배포 설정)
```

`features/` 는 **여전히 만들지 않는다** — FSD 는 레이어를 선택적으로 둔다(다만 `.oxlintrc.json`엔
`src/features/**` override가 이미 준비돼 있다). `shared/config`는 없다 — env는 `shared/api/env.ts`
하나로 합쳤다.

**import 규칙 두 가지만 기억하면 된다:**

1. **하향만** — `app → pages → features → entities → shared`. 위로는 못 올라간다.
2. **슬라이스 안은 상대 경로, 밖은 `@/` 별칭** — `@/`가 보이면 그건 경계를 넘은 것이다. 슬라이스는 루트 `index.ts`로만 접근한다.

둘 다 `npm run lint`가 강제한다(경계 강제는 oxlint `no-restricted-imports` — dependency-cruiser는 ADR 0001로 2026-08-20에 제거됐다). 위반하면 어떤 규칙에 왜 걸렸는지 메시지에 나온다. 설계 근거는 [layers 문서 §4](docs/architecture/layers.md#4-경계-강제-설계).

## 스타일 — 알아야 할 함정 둘

- **런타임 조립 클래스명 금지.** Tailwind 는 소스를 파싱하지 않고 평문으로 훑는다(공식). `` `btn--${variant}` `` 는 찾지 못하고 유틸리티가 생성되지 않는다 — 빌드는 성공하고 화면만 깨진다. 변이는 정적 룩업 `Record` 로만.
- **반대로, 주석과 문서의 단어도 유틸리티가 된다.** README 표의 `p-5 p-6` 과 주석의 bare `rounded` 가 실제로 산출 CSS 에 들어갔었다. `styles.css` 가 `.md` 를 스캔에서 빼고, 라운드 값 게이트가 토큰 밖 `border-radius` 를 잡는다. 그래도 `.tsx` 안에서 예시 토큰(`bg-[#…]`, `rounded-full`)을 쓸 때는 **쪼개 쓴다** — 붙여 쓰면 스캐너가 만들고 게이트가 막는다.

## 환경변수

프론트가 선언한 변수는 **`VITE_API_BASE` 하나뿐**이다 — `shared/api/env.ts::apiBase()`가 최초
사용 시점에 lazy 검증하고(모듈 최상위 상수로 내보내면 CI 테스트가 import 단계에서 전멸하고
`ErrorBoundary`가 못 잡는 흰 화면이 된다), `vite.config.ts`가 빌드·CI 게이트에서 값을 검사하며,
`vitest`는 테스트용 값(`https://api.test`)을 주입한다.

**배포 토폴로지 2종.** staging/production은 2026-08-26부터 backend와 같은 AKS Ingress 아래
same-origin으로 서빙된다(`/`=frontend, `/api`=backend) — Safari ITP/Brave Shields의 서드파티
쿠키 차단을 근본적으로 우회하기 위한 이관이었다. `VITE_API_BASE`는 빌드 타임에 번들에 구워지므로
staging/production 이미지가 분리된다(`frontend-docker-ci*.yml`). Azure Static Web Apps 배포
(`frontend-ci.yml`)는 PR 프리뷰·로컬 크로스오리진 검증용으로 별도 병행. 로컬 `.env.example`
기본값은 `http://localhost:8001`.

`.env` 에 `NODE_ENV=development` 한 줄이 있으면 프로덕션 빌드가 개발 시맨틱으로 돈다 — `vite.config.ts` 의 `assert-production-build` 게이트가 exit 1 로 막는다. **지우지 말 것.**

## 브랜치

`feature/frontend` → PR → `frontend` → PR → `main`. `frontend`·`main` 직접 push 금지.

`frontend` 대상 PR은 `frontend/ · docs/ · .github/` 밖 파일을 건드리면 path-guard 워크플로우가 CI를 실패시킨다. **저장소 루트 `README.md` 도 그 밖이다** — 이 브랜치에서 커밋하지 않는다.
