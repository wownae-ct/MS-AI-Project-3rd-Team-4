# Codebase Structure

**Analysis Date:** 2026-08-21

> `frontend/src/` 실제 트리를 `find`로 전수 확인해 작성했다(추측 없음). 제품 주제·도메인은 이번 매핑의 범위 밖이다(추후 확정 예정) — 아래 서술은 파일·디렉터리 구조에 한정한다.

## 저장소 좌표

git 루트는 `C:\programming\sesac-third-project\branchs\feature_frontend`이고, 앱 루트는 그 아래 `frontend/`다. `npm` 명령은 전부 `frontend/`에서 실행해야 한다. git 루트에는 `frontend/` 외에 `docs/`(gitignore 대상 기술 스펙 원문 1파일), `.github/`(CI 워크플로), `CLAUDE.md`, `README.md`가 있다.

## 디렉터리 레이아웃

```
C:\programming\sesac-third-project\branchs\feature_frontend\
├── frontend/                          # 앱 루트 — npm 명령은 여기서
│   ├── src/
│   │   ├── app/                       # 최상위 조립 + 진입점 (레이어: app)
│   │   │   ├── main.tsx               # JS 진입점 — createRoot 마운트
│   │   │   ├── App.tsx                # 최상위 컴포넌트 조립
│   │   │   └── App.test.tsx           # 조립 테스트(co-located)
│   │   ├── pages/                     # 화면 슬라이스 (레이어: pages)
│   │   │   └── style-guide/           # 슬라이스 1개
│   │   │       ├── index.ts           # 슬라이스 공개 API
│   │   │       └── ui/                # 세그먼트: ui (model·api·lib·config 없음)
│   │   │           ├── StyleGuidePage.tsx
│   │   │           ├── StyleGuidePage.test.tsx
│   │   │           ├── doc-parts.tsx  # 슬라이스 내부 전용 보조 컴포넌트
│   │   │           └── sections/      # ui 세그먼트 내부 하위 그룹
│   │   │               ├── ComponentsSection.tsx
│   │   │               ├── FoundationSection.tsx
│   │   │               └── SystemSection.tsx
│   │   ├── shared/                    # 최하층, 슬라이스 없음 (레이어: shared)
│   │   │   └── ui/                    # 세그먼트: ui (api·model·lib·config 없음)
│   │   │       ├── index.ts           # 공개 API(named export 배럴)
│   │   │       ├── Badge.tsx
│   │   │       ├── Button.tsx
│   │   │       ├── Card.tsx
│   │   │       ├── ErrorBoundary.tsx
│   │   │       ├── Money.tsx
│   │   │       ├── Page.tsx
│   │   │       ├── Progress.tsx
│   │   │       ├── Tabs.tsx
│   │   │       ├── icons.tsx
│   │   │       ├── styles.css         # 앱의 유일한 CSS 진입점(배럴 재수출 안 됨)
│   │   │       ├── theme.css          # Tailwind @theme 토큰
│   │   │       └── README.md          # 슬라이스 로컬 문서
│   │   ├── setupTests.ts              # vitest 전역 셋업(jest-dom 매처 등록)
│   │   └── vite-env.d.ts              # ImportMetaEnv 타입 단일 출처
│   ├── docs/                          # 커밋되는 팀 문서(gitignore 예외)
│   │   ├── README.md
│   │   ├── architecture/{README,layers,toolchain}.md
│   │   └── adr/{README,TEMPLATE,0001~0004*}.md
│   ├── scripts/
│   │   └── check-bundle-budget.mjs    # 빌드 후 번들 예산·디자인 규범 게이트
│   ├── index.html                     # HTML 진입점
│   ├── vite.config.ts
│   ├── tsconfig.json                  # references만(files: [])
│   ├── tsconfig.app.json              # 실제 컴파일러 옵션 + paths
│   ├── .oxlintrc.json                 # 린트 규칙 + 레이어 경계 강제
│   ├── package.json
│   └── staticwebapp.config.template.json
├── docs/                              # git 루트 docs — gitignore 대상, 커밋 안 됨
│   └── frontend_architecture_v3.7.md
├── .github/workflows/                 # frontend-ci.yml 등 5개
└── CLAUDE.md
```

## 디렉터리 목적

**`frontend/src/app/`:**
- 목적: 앱 전체를 하나로 조립하고 DOM에 마운트
- 포함: 진입점 파일 1개, 조립 컴포넌트 1개, 테스트 1개
- 주요 파일: `frontend/src/app/main.tsx`, `frontend/src/app/App.tsx`

**`frontend/src/pages/`:**
- 목적: 화면 단위 슬라이스를 담는 레이어. 현재 슬라이스 1개(`style-guide`)만 존재
- 포함: 슬라이스별 하위 디렉터리, 각 슬라이스는 루트에 `index.ts` 공개 API를 둠
- 주요 파일: `frontend/src/pages/style-guide/index.ts`

**`frontend/src/pages/style-guide/ui/`:**
- 목적: 해당 슬라이스의 `ui` 세그먼트 — 표시 관련 컴포넌트 전부
- 포함: 조립 컴포넌트(`StyleGuidePage.tsx`), 슬라이스 로컬 보조 컴포넌트(`doc-parts.tsx`), 하위 그룹 디렉터리(`sections/`)
- 세그먼트 내부에 추가 하위 폴더(`sections/`)를 둔 것은 이 슬라이스에 고유한 조직화이며, FSD 공식 세그먼트 5종(`ui`/`api`/`model`/`lib`/`config`) 중 `ui` 세그먼트 하나만 실제로 쓰인다.

**`frontend/src/shared/ui/`:**
- 목적: 레이어 전체가 재사용하는 UI 프리미티브와 그 CSS
- 포함: 프리미티브 컴포넌트(1파일 1컴포넌트, `PascalCase.tsx`), 아이콘 모음(`icons.tsx` 1파일에 여러 아이콘), CSS 2개, 로컬 README
- 주요 파일: `frontend/src/shared/ui/index.ts`(공개 API), `frontend/src/shared/ui/styles.css`(CSS 진입점, `app/main.tsx`가 직접 import)

## 주요 파일 위치

**진입점:**
- `frontend/index.html`: HTML 진입점, `#root` 컨테이너 + 모듈 스크립트 태그
- `frontend/src/app/main.tsx`: JS 진입점, DOM 마운트

**설정:**
- `frontend/vite.config.ts`: 빌드/개발 서버/테스트 설정, 커스텀 프로덕션 빌드 가드 플러그인
- `frontend/tsconfig.json` + `frontend/tsconfig.app.json`: TypeScript 컴파일러 설정(project references), 경로 별칭 `@/*` 선언
- `frontend/.oxlintrc.json`: 린트 규칙 + FSD 레이어 경계 강제(오버라이드 4개)
- `frontend/package.json`: 스크립트(`dev`/`build`/`typecheck`/`lint`/`test`/`preview`), 의존성

**핵심 로직:**
- `frontend/src/app/App.tsx`: 최상위 컴포넌트 조립 지점(현재 단일 페이지 무조건 렌더)
- `frontend/src/shared/ui/index.ts`: 공용 UI 공개 API 정의 지점

**테스트:**
- `frontend/src/app/App.test.tsx`
- `frontend/src/pages/style-guide/ui/StyleGuidePage.test.tsx`
- `frontend/src/setupTests.ts`: 전역 테스트 셋업(모든 테스트 실행 전 1회, `vite.config.ts`의 `test.setupFiles`가 지정)

## 명명 규칙

**파일:**
- React 컴포넌트 파일: `PascalCase.tsx`, 파일명이 해당 컴포넌트의 주요 named export와 일치(예: `Button.tsx` → `export function Button`, `Page.tsx` → `export function Page`)
- 테스트 파일: `{대상파일명}.test.tsx`(컴포넌트) 또는 `{대상파일명}.test.ts`, 대상과 동일 디렉터리에 co-location(별도 `__tests__/` 디렉터리 없음)
- 슬라이스 공개 API 파일: 항상 `index.ts`(디렉터리 루트, 확장자는 `.ts` — JSX를 포함하지 않고 재수출만 하기 때문)
- 슬라이스 내부 전용 다목적 보조 파일: `kebab-case.tsx`(예: `doc-parts.tsx` — 여러 개의 작은 named export를 담는 파일이라 단일 컴포넌트명과 다름)
- 설정 파일: 각 도구의 관례를 따름(`vite.config.ts`, `.oxlintrc.json`, `tsconfig.app.json`)

**디렉터리:**
- 레이어 디렉터리: 소문자 단수/복수 그대로(`app`, `pages`, `shared`) — FSD 공식 레이어명
- 슬라이스 디렉터리: `kebab-case`(예: `style-guide`)
- 세그먼트 디렉터리: FSD 공식 세그먼트명 그대로(`ui`)
- 세그먼트 내부 하위 그룹: 필요 시 자유 명명, 현재 사례는 `sections`(복수형, 여러 섹션 컴포넌트를 모음)

## 새 코드를 추가할 위치

**새 화면(페이지) 슬라이스:**
- 위치: `frontend/src/pages/{slice-name}/`(kebab-case)
- 필수 구성: 루트에 `index.ts`(공개 API), `ui/` 세그먼트에 실제 컴포넌트
- 공개 API 규칙: 슬라이스 밖에서는 반드시 `index.ts`를 거쳐야 함 — `frontend/.oxlintrc.json`의 `src/pages/**` override가 내부 파일 직접 import를 차단
- 참고 기존 예시: `frontend/src/pages/style-guide/`

**새 공용 UI 프리미티브:**
- 위치: `frontend/src/shared/ui/{PascalCase}.tsx`
- 필수: `frontend/src/shared/ui/index.ts`에 named export(+ 필요 시 props 타입)를 추가해야 슬라이스 밖에서 사용 가능
- 참고 기존 예시: `frontend/src/shared/ui/Button.tsx`(단순 props 변형), `frontend/src/shared/ui/Tabs.tsx`(compound 패턴, 슬롯 3개 이상일 때)

**새 레이어(`entities`/`features`) 최초 도입 시:**
- `frontend/.oxlintrc.json`에 해당 레이어의 경계 규칙 override가 **이미 선언돼 있다**(`src/entities/**`, `src/features/**`) — 디렉터리만 만들면 즉시 적용됨. 설정 추가 불필요.
- FSD 규범상 각 슬라이스는 `model.ts`(또는 `model/`) + 필요한 세그먼트(`api`/`ui`/`lib`) + 공개 `index.ts` 구성을 따르는 것이 이 저장소의 과거 관례였다(현재 트리에는 실례 없음 — `frontend/docs/architecture/layers.md` §2.1에 과거 배치 기록이 있으나 해당 코드는 삭제됨).

**새 전역 상태/네트워크 계층 도입 시:**
- 현재 트리에 선례가 없다(§ARCHITECTURE.md 데이터 흐름 참조). 배치 판단 근거가 될 과거 결정 기록은 `frontend/docs/architecture/layers.md` §2.1(도메인 API를 `entities/{slice}/api/`에 두기로 한 판단과 이유)에 남아 있으나, 해당 코드 자체는 현재 존재하지 않는다.

## 특수 디렉터리

**`frontend/scripts/`:**
- 목적: 빌드 후 실행되는 검증 스크립트
- 생성 여부: 아니오(수동 작성 스크립트)
- 커밋 여부: 예
- 내용: `check-bundle-budget.mjs`(`npm run build`가 `vite build` 뒤에 호출)

**`frontend/docs/`:**
- 목적: 팀 공유 아키텍처/ADR 문서
- 생성 여부: 아니오
- 커밋 여부: 예(`.gitignore`의 `!frontend/docs/` 예외 규칙)

**git 루트 `docs/`:**
- 목적: 기술 스펙 원문(`frontend_architecture_v3.7.md`) 보관
- 생성 여부: 아니오
- 커밋 여부: **아니오**(`.gitignore` 대상 — `frontend/docs/README.md:69`에서 확인)

**`node_modules/`:**
- 목적: npm 의존성
- 생성 여부: 예(`npm ci`/`npm install`)
- 커밋 여부: 아니오 — CLAUDE.md 명시: "새 클론·새 환경이면 먼저 `npm ci`"

---

*Structure analysis: 2026-08-21*
