# frontend

React 19 + TypeScript 7 + Vite 8 + Tailwind CSS v4 + Base UI. 메리맵(MerryMap — 웨딩 예산·타임라인·상담) 프론트엔드.

**지금 `src` 에는 제품 화면이 없고 디자인 시스템 기반 + 스타일가이드 1화면만 있다.** 미완성이 아니라 의도한 상태다 — 화면 6개의 시각 스펙은 [`docs/mockups/`](docs/mockups/README.md)에 도착해 있고, 앱 셸·라우트 계약은 [`docs/design/layout.md`](docs/design/layout.md)에 있으며, 라우터 선택(ADR 0005)이 선행한다.

문서 지도는 [`docs/README.md`](docs/README.md). 자주 찾는 것:

| 필요 | 문서 |
|---|---|
| 색 · 서체 · 형태 · 접근성 규범과 근거 (SSOT) | [`docs/design/`](docs/design/README.md) — 결정은 [decisions.md](docs/design/decisions.md) |
| 토큰 → 유틸리티 매핑 · 코드 규약 · 게이트 | [`src/shared/ui/README.md`](src/shared/ui/README.md) |
| 툴체인 결정 · 버전 · CI 게이트 · 실측 기준선 | [`docs/architecture/toolchain.md`](docs/architecture/toolchain.md) |
| 레이어 · 별칭 · 경계 강제 | [`docs/architecture/layers.md`](docs/architecture/layers.md) |
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
| `npm test` | `vitest run` — 화면 테스트 + **게이트 픽스처**(`scripts/lib/__tests__/`) |
| `npm run build` | `tsc -b && vite build && node scripts/check-bundle-budget.mjs` — 마지막 단계가 **번들 예산 + 디자인 규범 게이트**다 |
| `npm run preview -- --host 127.0.0.1` | 빌드 산출물 서빙. **`--host` 필수** — 기본은 `[::1]`만 listen 해서 `127.0.0.1`로는 연결이 거부된다 |

**검증 게이트는 4개다** — `typecheck → lint → test → build`. 커밋 전 전부 돌린다. CI도 같은 순서로 실행한다.

### `build` 끝의 게이트가 막는 것

[`scripts/check-bundle-budget.mjs`](scripts/check-bundle-budget.mjs)가 산출물을 디스크에서 읽어 검사한다. 예산(JS gzip · 최대 청크 · CSS gzip(@font-face 제외) · 폰트 raw)과 **디자인 규범** — 그림자·링, 팔레트 밖 색, 토큰 밖 라운드, 다크모드, `theme.css` 폐기 선언 유지, 그리고 소스의 색 임의값·`ring-*`·그림자 토큰(`file:line`). 검사 본체는 [`scripts/lib/`](scripts/lib/)의 순수 모듈이고 픽스처가 `npm test`에서 돈다. 상세는 [`src/shared/ui/README.md` 「게이트」](src/shared/ui/README.md#게이트).

위반이면 exit 1 이고 **우회 플래그가 없다.** 새 색·라운드가 필요하면 [decisions.md](docs/design/decisions.md) → `theme.css` 순서로 넣으면 화이트리스트가 자동으로 따라온다.

## 구조 — Feature-Sliced Design

```
src/
  app/          App.tsx(RouterProvider) · main.tsx · router/router.tsx(코드 기반 라우트 트리 · lazy 분할) · ui/AppShell.tsx(탭바↔사이드바)
  pages/
    dashboard/    ✅ S2 — 첫 화면이라 정적 import(초기 청크)
    report/       ✅ S5 — lazy. 예산 3분할은 카드 폭에 따라 컨테이너 쿼리로 적층된다
    category · timeline · budget · onboarding — 스캐폴드(라우트·셸 배선만)
    style-guide/  디자인 시스템 라이브 문서 — 토큰·프리미티브·규범이 실제로 동작하는지 눈으로 검증하는 실체
  entities/
    wedding/      도메인 타입 + 합성 데이터의 단일 출처 — 목업 6개 중 5개가 같은 값을 본다. 전송 계층이 붙으면 데이터 파일만 사라진다
  shared/
    ui/           styles.css(유일한 CSS 진입점) · theme.css(@theme 토큰) · Page · Card · Button · Badge · Money · Progress · Tabs · ErrorBoundary · icons
public/
  staticwebapp.config.json  SWA 가 읽는 배포 설정 — Vite 가 dist/ 루트로 복사한다(SPA 폴백 · 자산 캐시 · CSP)
scripts/
  check-bundle-budget.mjs   build 끝 게이트 (오케스트레이터 — 예산 · 규범 · 폐기 유지 · 배포 설정)
  lib/                       css-norms · source-norms · deploy-config (순수 모듈) · __tests__/(픽스처 · 폐기 계약 · 유령 후보 · 배포 설정)
```

`features/` 는 **아직 만들지 않는다** — FSD 는 레이어를 선택적으로 둔다. `entities/wedding` 은 2026-08-22 에 생겼다(두 번째 화면이 같은 데이터를 보게 되면서 조건이 충족됐다 — `.oxlintrc.json` 이 `pages → pages` import 를 막으므로 데이터를 화면 슬라이스에 둘 수 없다). `shared/api` · `shared/config` · `shared/lib` 는 주제 전환으로 삭제됐다(백엔드 미착수).

**import 규칙 두 가지만 기억하면 된다:**

1. **하향만** — `app → pages → features → entities → shared`. 위로는 못 올라간다.
2. **슬라이스 안은 상대 경로, 밖은 `@/` 별칭** — `@/`가 보이면 그건 경계를 넘은 것이다. 슬라이스는 루트 `index.ts`로만 접근한다.

둘 다 `npm run lint`가 강제한다. 위반하면 어떤 규칙에 왜 걸렸는지 메시지에 나온다. 설계 근거는 [layers 문서 §4](docs/architecture/layers.md#4-경계-강제-설계).

## 스타일 — 알아야 할 함정 둘

- **런타임 조립 클래스명 금지.** Tailwind 는 소스를 파싱하지 않고 평문으로 훑는다(공식). `` `btn--${variant}` `` 는 찾지 못하고 유틸리티가 생성되지 않는다 — 빌드는 성공하고 화면만 깨진다. 변이는 정적 룩업 `Record` 로만.
- **반대로, 주석과 문서의 단어도 유틸리티가 된다.** README 표의 `p-5 p-6` 과 주석의 bare `rounded` 가 실제로 산출 CSS 에 들어갔었다. `styles.css` 가 `.md` 를 스캔에서 빼고, 라운드 값 게이트가 토큰 밖 `border-radius` 를 잡는다. 그래도 `.tsx` 안에서 예시 토큰(`bg-[#…]`, `rounded-full`)을 쓸 때는 **쪼개 쓴다** — 붙여 쓰면 스캐너가 만들고 게이트가 막는다.

## 환경변수

프론트가 선언한 변수는 **`VITE_API_BASE` 하나뿐**이고 **지금은 읽는 코드가 없다** — 전송 계층이 주제 전환으로 삭제됐다. **백엔드 호스트는 2026-08-22 확정됐다** — `https://20-249-52-148.nip.io`(잠정 · nip.io · Let's Encrypt), 헬스 `GET /api/v1/health`, CORS 는 `http://localhost:5173` 과 SWA 오리진만. 도달·CORS 실측표와 함정 2건(**`http://` 를 넣으면 브라우저에서만 조용히 실패** · dev 서버는 `localhost` 로만)은 [toolchain §6.2](docs/architecture/toolchain.md#6-환경변수). 다시 세울 때 `?? ""` 같은 조용한 폴백을 두지 않는다. [toolchain §6](docs/architecture/toolchain.md#6-환경변수).

`.env` 에 `NODE_ENV=development` 한 줄이 있으면 프로덕션 빌드가 개발 시맨틱으로 돈다 — `vite.config.ts` 의 `assert-production-build` 게이트가 exit 1 로 막는다. **지우지 말 것.**

## 브랜치

`feature/frontend` → PR → `frontend` → PR → `main`. `frontend`·`main` 직접 push 금지.

`frontend` 대상 PR은 `frontend/ · docs/ · .github/` 밖 파일을 건드리면 path-guard 워크플로우가 CI를 실패시킨다. **저장소 루트 `README.md` 도 그 밖이다** — 이 브랜치에서 커밋하지 않는다.
