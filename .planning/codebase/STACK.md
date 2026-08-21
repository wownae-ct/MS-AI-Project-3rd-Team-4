# Technology Stack

**Analysis Date:** 2026-08-21

> 제품 주제·도메인은 이번 매핑의 범위 밖(추후 확정 예정)이다. 아래는 코드·설정 파일에서 직접 확인한 기술 사실만 기록한다.

## Languages

**Primary:**
- TypeScript `~7.0.2` — 틸드 핀, TS6/TS7 별칭 병존 없이 단독 채택. `frontend/package.json:33`, 컴파일 옵션은 `frontend/tsconfig.app.json`.
  - `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `jsx: "react-jsx"`
  - `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noFallthroughCasesInSwitch: true`
  - `types: ["vite/client", "vitest/globals"]`
  - `paths: { "@/*": ["./src/*"] }` — `baseUrl` 없이 선언(TS7이 `baseUrl`을 제거했기 때문, `frontend/tsconfig.app.json:14-18` 주석).
  - Project references 구조: `frontend/tsconfig.json`(`files: []`, `references: [{ path: "./tsconfig.app.json" }]`) + `frontend/tsconfig.app.json`(실제 컴파일 옵션). `include: ["src", "vite.config.ts"]`.

**Secondary:**
- CSS — Tailwind v4 유틸리티 + 커스텀 `@font-face`(가변 웹폰트). `frontend/src/shared/ui/styles.css`, `frontend/src/shared/ui/theme.css`.

## Runtime

**Environment:**
- Node.js — 정확 버전 단일 출처는 `frontend/.nvmrc` = `24.19.0`. 허용 범위는 `frontend/package.json` `engines.node` = `^24.15.0`(`frontend/package.json:6-8`).
  - 하한 근거: `jsdom@30.0.1`의 `engines` 필드가 `^22.22.2 || ^24.15.0 || >=26.0.0`으로 전체 의존성 중 가장 좁다 — `frontend/node_modules/jsdom/package.json`에서 직접 확인.
- 빌드 산출물 브라우저 타깃: `["chrome111", "edge111"]` 명시 배열, `frontend/vite.config.ts:78`(Vite 기본값 `baseline-widely-available` 위임 안 함). 코드 주석은 이 값이 "이전 주제에서 상속된 것"이며 현재 기준으로 재검토되지 않았다고 명시한다(`frontend/vite.config.ts:74-77`).

**Package Manager:**
- npm. 락파일 존재: `frontend/package-lock.json`(`lockfileVersion: 3`).
- `frontend/.npmrc`에 `engine-strict=true` — `engines` 미달 시 npm 기본 동작(EBADENGINE 경고, exit 0)을 실패(exit 1)로 승격한다. 모든 전이 의존성의 `engines`에도 적용된다(npm 공식 동작).
- 정확 버전 고정(`npm i -E`, 캐럿 없음) 확인된 패키지: `@base-ui/react`(1.7.0), `@tailwindcss/vite`(4.3.3), `tailwindcss`(4.3.3), `@testing-library/user-event`(14.6.5), `wanted-sans`(1.0.3). 나머지는 캐럿 범위(`^`).

## Frameworks

**Core:**
- React `^19.2.8` + `react-dom` `^19.2.8` — `frontend/package.json:19-20`.
- Vite `^8.2.1` — 빌드/개발 서버, 설정 `frontend/vite.config.ts`.
- Tailwind CSS `4.3.3`(정확 핀) + `@tailwindcss/vite` `4.3.3` — `frontend/vite.config.ts:62`에서 `tailwindcss({ optimize: false })`로 등록. `optimize: false`는 lightningcss 중복 실행을 피하기 위한 명시적 선택(주석에 ADR 0003 참조).
- `@base-ui/react` `1.7.0` — 헤드리스 UI 프리미티브. 실제 사용 확인: `frontend/src/shared/ui/Progress.tsx:5`(`Progress` from `@base-ui/react/progress`), `frontend/src/shared/ui/Tabs.tsx:10`(`Tabs` from `@base-ui/react/tabs`).
- `wanted-sans` `1.0.3` — 가변 웹폰트. `frontend/src/shared/ui/styles.css:16`에서 `@import "wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.css";`로 로드(92조각 unicode-range 서브셋).

**Testing:**
- Vitest `^4.1.10` — 설정은 `frontend/vite.config.ts`의 `test` 블록: `environment: "jsdom"`, `globals: true`, `setupFiles: "./src/setupTests.ts"`, `exclude: ["**/node_modules/**", "**/dist/**"]`.
- `@testing-library/react` `^16.3.2`, `@testing-library/jest-dom` `^7.0.1`, `@testing-library/user-event` `14.6.5`(정확 핀).
- `jsdom` `^30.0.1` — Node 엔진 하한을 결정하는 패키지이기도 하다(위 Runtime 절).

**Build/Dev:**
- `@vitejs/plugin-react` `^6.0.5`.
- `oxlint` `^1.78.0` — 린트 + FSD 레이어 경계 강제. 설정 `frontend/.oxlintrc.json`.
  - `plugins: ["eslint", "typescript", "unicorn", "oxc", "import", "react", "jsx-a11y"]` — oxlint의 `plugins` 필드는 확장이 아니라 대체이므로 기본 4종(eslint·typescript·unicorn·oxc)을 다시 나열하고 `import`·`react`·`jsx-a11y`를 추가한 형태.
  - `categories: { correctness: "error", perf: "error", suspicious: "error", pedantic: "error" }`.
  - `no-restricted-imports` 규칙으로 FSD 슬라이스 경계(루트 `index` 우회 금지, 슬라이스 넘는 상대 경로 금지)를 강제하며, `overrides` 4건(`src/shared/**`, `src/entities/**`, `src/features/**`, `src/pages/**`)에서 레이어별 추가 제약(상위 레이어 import 금지 등)을 반복 선언한다(`frontend/.oxlintrc.json:36-151`).
  - 직접 실행 확인(`npx oxlint --format=json .`, 2026-08-21): **297 rules · 24 files · 0 diagnostics**. `frontend/docs/architecture/toolchain.md` §1에 기록된 값과 일치.
- `dependency-cruiser`는 devDependencies에 없음 — 제거됨. 경계 검사는 oxlint 단독.

## Key Dependencies

**Critical:**
- `react` / `react-dom` `19.2.8` — UI 런타임.
- `@base-ui/react` `1.7.0` — 헤드리스 컴포넌트 프리미티브(현재 `Progress`, `Tabs`에서 사용).
- `typescript` `~7.0.2` — 유일한 타입 검사기. `frontend/docs/architecture/toolchain.md` §3.1에 따르면 `dependency-cruiser`가 TypeScript 컴파일러 API(TS6까지만 지원)를 요구했던 것이 TS6/TS7 병존의 유일한 이유였고, `dependency-cruiser` 제거로 그 제약이 사라져 TS7 단독 채택이 가능해졌다.

**Infrastructure:**
- `vite` `^8.2.1` — 별칭 해석은 `resolve.tsconfigPaths: true`(`frontend/vite.config.ts:68`) 하나로 단일화, `tsconfig.app.json`의 `paths`를 그대로 읽는다(수동 `alias` 미사용).
- `oxlint` `^1.78.0` — `dependency-cruiser`(제거됨)를 대체하는 FSD 경계 강제 수단.
- `tailwindcss` `4.3.3` / `@tailwindcss/vite` `4.3.3` — 스타일링.

## Configuration

**Environment:**
- `frontend/.env` 파일 존재(내용은 정책상 읽지 않음 — 존재 여부만 `ls`로 확인).
- `frontend/.env.example` 존재 — 프론트 설정 키(`VITE_API_BASE`)와 Azure 인프라 설정 키(Key Vault·PostgreSQL·AKS·Static Web Apps·Log Analytics 관련 이름) 항목을 포함하나 모든 값이 빈 플레이스홀더이며 실값·비밀 없음.
- Vite 환경변수 규칙: `VITE_` 접두 변수만 클라이언트 번들에 노출(`envPrefix` 기본값), `.env`는 프로젝트 루트(`envDir` 기본값)에서 로드, 값은 빌드타임 정적 치환.
- 타입 선언: `frontend/src/vite-env.d.ts`가 `ImportMetaEnv.VITE_API_BASE?: string`(선택값)을 선언. 파일 내 주석은 "값을 읽는 곳은 `src/shared/config/env.ts` 하나"라고 명시하지만, 그 경로는 현재 워킹트리에 존재하지 않는다(상세는 `.planning/codebase/INTEGRATIONS.md`).
- `frontend/src/vite-env.d.ts`는 `import` 문 없이 `/// <reference types="vite/client" />` 트리플슬래시 참조만 사용 — 파일 내 주석은 `import` 문이 들어가면 전역 증강이 깨진다는 Vite 공식 문서 경고를 근거로 든다.

**Build:**
- `frontend/vite.config.ts` — 커스텀 플러그인 `assertProductionBuild()`(`apply: "build"`)가 `configResolved` 훅에서 `config.mode === "production"`인데 `config.isProduction === false`이면 빌드를 예외로 실패시킨다(exit 1). `.env`에 `NODE_ENV=development`가 섞여 들어오는 것을 잡기 위한 게이트(`frontend/vite.config.ts:27-50`).
- `frontend/scripts/check-bundle-budget.mjs` — `npm run build` 체인의 마지막 단계(`tsc -b && vite build && node scripts/check-bundle-budget.mjs`, `frontend/package.json:11`). `frontend/dist/assets`를 직접 읽어 gzip 바이트 예산을 검사:
  - JS 합계(gzip) ≤ 92,000 B, 최대 단일 JS 청크(gzip) ≤ 92,000 B, CSS(gzip, `@font-face` 블록 제외) ≤ 6,000 B, 폰트 파일 합계(raw) ≤ 2,600,000 B.
  - 산출 CSS에 대해 정규식 기반 규범 검사 2건도 수행(값 기준): `box-shadow` 값이 `none`이 아닌 경우, `prefers-color-scheme` 존재 시 각각 위반으로 처리하고 `process.exitCode = 1`.
- Project references는 `app` 단일 프로젝트만 존재(`frontend/tsconfig.json`).

## Platform Requirements

**Development:**
- Node.js `24.19.0`(정확), `engine-strict=true`로 하한 미달 시 `npm install`/`npm ci`가 exit 1.
- `node_modules/`는 git에 추적되지 않음 — 새 클론·새 환경에서는 `npm ci` 선행 필요.

**Production:**
- 정적 빌드 산출물(`frontend/dist/`). 배포 대상은 Azure Static Web Apps(상세는 `.planning/codebase/INTEGRATIONS.md`). 빌드는 GitHub Actions 러너에서 직접 실행되고 SWA 배포 액션은 업로드만 수행(`skip_app_build: true`) — SWA 내부 Oryx 빌드 컨테이너에는 `VITE_*` 환경변수가 전달되지 않기 때문(`.github/workflows/frontend-ci.yml:9-12`).

## 문서 정합성 관찰 (기술적 사실)

- `frontend/docs/architecture/toolchain.md` §4 의존성 표는 `zustand 5.0.15`를 "채택"으로 기록하지만, 직접 확인 결과 `frontend/package.json`, `frontend/package-lock.json`, `frontend/node_modules/`(2026-08-21 기준) 어디에도 `zustand`가 없다 — 문서가 현재 트리보다 지연되어 있다.
- `frontend/docs/architecture/toolchain.md`는 오늘 날짜(2026-08-21)로 "최종 갱신" 표기가 있고, 여기 기록된 297 rules·24 files·0 diagnostics(oxlint) 및 2 files·13 tests(vitest) 값은 본 매핑에서 직접 실행해 재확인한 값과 일치한다.

---

*Stack analysis: 2026-08-21*
