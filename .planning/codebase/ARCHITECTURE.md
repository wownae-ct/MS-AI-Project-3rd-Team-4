# Architecture

**Analysis Date:** 2026-08-21

> 이 문서는 `frontend/src/` 실제 트리와 설정 파일(`frontend/.oxlintrc.json`, `frontend/vite.config.ts`, `frontend/tsconfig*.json`)을 직접 읽어 작성했다. 제품 주제·도메인은 이번 매핑의 범위 밖이다(추후 확정 예정) — 화면·컴포넌트는 렌더 구조로만 서술한다.

## 시스템 개요

`frontend/src/`에는 현재 **`app` · `pages` · `shared`** 3개 레이어만 실존한다. `frontend/.oxlintrc.json`은 `entities`·`features` 레이어의 경계 규칙도 미리 선언해 두었지만, 두 디렉터리 자체는 `frontend/src/` 아래 존재하지 않는다(`find frontend/src -type d` 결과에 없음). 아래 다이어그램은 **실제로 존재하는 레이어만** 그린다.

```text
┌─────────────────────────────────────────────────────────────┐
│  app — 조립 + 마운트                                          │
│  `frontend/src/app/main.tsx` · `frontend/src/app/App.tsx`    │
└──────────────────────────┬────────────────────────────────────┘
                           │ import (`@/pages/style-guide`)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  pages — 화면 슬라이스 (현재 1개: style-guide)                 │
│  `frontend/src/pages/style-guide/`                            │
│  세그먼트: `ui/` 만 존재 (`model`·`api`·`lib`·`config` 없음)     │
└──────────────────────────┬────────────────────────────────────┘
                           │ import (`@/shared/ui`)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  shared — 최하층, 슬라이스 없음(세그먼트만)                     │
│  `frontend/src/shared/ui/` — 공용 프리미티브 + CSS 진입점       │
└─────────────────────────────────────────────────────────────┘

(설정상 선언은 있으나 실제 디렉터리가 없는 레이어)
  · `src/entities/**` — `.oxlintrc.json`에 override 존재, 실제 디렉터리 없음
  · `src/features/**` — 〃
  · `app/store/`, `shared/api/`, `shared/config/` — 과거 존재했으나 현재 git 워킹트리에서 삭제됨(§부록)
```

## 컴포넌트 책임

| 컴포넌트 | 책임 | 파일 |
|-----------|----------------|------|
| 마운트 진입점 | `#root` DOM 확인 후 `createRoot` 마운트, `StrictMode` + `ErrorBoundary`로 `App` 감쌈 | `frontend/src/app/main.tsx` |
| 앱 조립 | 최상위 컴포넌트 조립. 현재는 단일 페이지 컴포넌트를 조건 없이 렌더 | `frontend/src/app/App.tsx` |
| 화면 슬라이스 공개 API | `pages/style-guide` 슬라이스 밖에서 접근 가능한 유일한 진입점 | `frontend/src/pages/style-guide/index.ts` |
| 화면 조립 | 하위 섹션 컴포넌트들을 `Page` 프리미티브 안에 배치 | `frontend/src/pages/style-guide/ui/StyleGuidePage.tsx` |
| 슬라이스 내부 전용 조각 | 해당 슬라이스 밖으로 노출하지 않는 보조 컴포넌트(`Section`·`Rule`·`OpenDecision`) | `frontend/src/pages/style-guide/ui/doc-parts.tsx` |
| 공용 UI 공개 API | `shared/ui` 밖에서 접근 가능한 유일한 진입점(CSS 제외) | `frontend/src/shared/ui/index.ts` |
| 렌더 예외 처리 | 렌더 중 예외를 잡아 대체 UI 표시, 클래스 컴포넌트 | `frontend/src/shared/ui/ErrorBoundary.tsx` |
| CSS 진입점 | 앱 전체에서 1회만 import되는 스타일 진입점 | `frontend/src/shared/ui/styles.css` |
| 디자인 토큰 | Tailwind `@theme` 토큰 선언 | `frontend/src/shared/ui/theme.css` |

## 패턴 개요

**전체:** FSD(Feature-Sliced Design) 지향 레이어 구조. 하향 import만 허용(`app → pages → features → entities → shared`가 규범이나, 현재 트리에는 `pages`와 `shared`만 실존). 근거: `frontend/docs/architecture/layers.md` §1.

**핵심 특징:**
- 레이어 경계는 런타임 프레임워크가 아니라 **정적 린트 규칙**(oxlint `no-restricted-imports`)으로 강제된다 — `frontend/.oxlintrc.json`
- 슬라이스 공개 API는 각 슬라이스 루트의 `index.ts` 하나로 제한된다 — 슬라이스 내부 파일 직접 import는 린트 오류
- 슬라이스 내부는 상대 경로, 슬라이스를 넘는 import는 `@/` 별칭만 허용 — 이 규약 자체가 "`@/`가 보이면 경계를 넘었다"는 신호로 쓰인다
- 라우터 없음, 전역 상태 저장소 없음, API 전송 계층 없음 — 현재 트리 기준 확인됨(§부록)

## 레이어

**app:**
- 위치: `frontend/src/app/`
- 포함: 진입점(`main.tsx`), 최상위 조립(`App.tsx`), 조립 테스트(`App.test.tsx`)
- 의존: `pages`(`@/pages/style-guide`), `shared`(`@/shared/ui`)
- 피의존: 없음(최상위)

**pages:**
- 위치: `frontend/src/pages/`
- 포함: 슬라이스 1개 — `style-guide/`(`ui/` 세그먼트만, `model`·`api`·`lib`·`config` 없음)
- 의존: `shared`(`@/shared/ui`)만. 다른 `pages` 슬라이스나 `app` import는 oxlint `src/pages/**` override로 금지
- 피의존: `app`

**shared:**
- 위치: `frontend/src/shared/`
- 포함: `ui/` 세그먼트 하나만 존재(공식 FSD는 `ui`·`api`·`model`·`lib`·`config` 5종을 허용하나 이 저장소는 현재 `ui`만 씀)
- 의존: 없음(최하층). `@/app`·`@/pages`·`@/features`·`@/entities` import는 oxlint `src/shared/**` override로 금지
- 피의존: `pages`, `app`

## 데이터 흐름

### 렌더 경로(현재 트리 기준)

1. `index.html`의 `<script type="module" src="/src/app/main.tsx">`가 진입점 로드 (`frontend/index.html:10`)
2. `main.tsx`가 `#root` 요소 존재를 확인하고(없으면 명시적 `Error` throw), `createRoot(...).render(<StrictMode><ErrorBoundary><App/></ErrorBoundary></StrictMode>)` 호출 (`frontend/src/app/main.tsx:9-20`)
3. `App`이 `pages/style-guide`의 `StyleGuidePage`를 무조건 렌더 — 분기·상태 전환 없음 (`frontend/src/app/App.tsx:15-17`)
4. `StyleGuidePage`가 `Page` 프리미티브 안에 섹션 컴포넌트들(`ColorSection`·`TypographySection`·`MoneySection`·`ButtonSection`·`BadgeSection`·`ProgressSection`·`TabsSection`·`SurfaceSection`·`FocusSection`·`NonGoalsSection`)을 순서대로 배치 (`frontend/src/pages/style-guide/ui/StyleGuidePage.tsx:21-38`)
5. 각 섹션 컴포넌트가 `shared/ui`의 프리미티브(`Badge`·`Button`·`Card`·`Money`·`Progress`·`Tabs`·아이콘)를 조합 (`frontend/src/pages/style-guide/ui/sections/*.tsx`)

**상태 관리:** 위 흐름에는 컴포넌트 로컬 상태(`useState`/`useRef`, 예: `Page.tsx`의 포커스 이동용 `useRef`) 외에 별도 전역 상태 저장소가 없다. `zustand`는 `frontend/package.json`의 `dependencies`/`devDependencies` 어디에도 없음(확인됨) — CLAUDE.md·과거 커밋이 언급하는 `app/store/practice-store.ts`(Zustand)는 `git status`상 삭제(D) 상태이며 현재 트리에 없다.

### 라우팅

**없음.** `react-router` 등 라우팅 라이브러리가 `frontend/package.json`에 없다. `App.tsx`의 코드 주석은 향후 라우터 도입 계획(주석상 "ADR 0005")을 언급하나, `frontend/docs/adr/`에는 `0001`~`0004` + `README.md` + `TEMPLATE.md`만 존재하고 `0005` 파일은 없다(확인되지 않음) — `frontend/src/app/App.tsx:5-12`.

### API / 네트워크 계층

**없음.** `frontend/src/shared/api/`(`client.ts`·`health.ts`) 및 각 엔티티의 `api/` 세그먼트는 `git status`상 전부 삭제(D)됐고 현재 `frontend/src/` 트리에 존재하지 않는다(`find frontend/src -type f` 결과에 없음). `fetch` 호출 코드가 현재 트리에 없다.

## 주요 추상화

**슬라이스 공개 API(`index.ts` 배럴):**
- 목적: 슬라이스 내부 파일에 대한 외부 직접 참조 차단
- 예시: `frontend/src/pages/style-guide/index.ts`(단일 named export `StyleGuidePage`), `frontend/src/shared/ui/index.ts`(프리미티브 + 타입 재수출)
- 패턴: named export만, default export 없음(`App.tsx`의 `export default App`은 예외 — app 레이어는 슬라이스가 아님)
- 예외: CSS는 사이드이펙트 import라 배럴로 재수출할 수 없다. `frontend/src/shared/ui/styles.css`는 `frontend/src/app/main.tsx`가 `@/shared/ui/styles.css` 깊은 경로로 직접 import한다 — `frontend/src/shared/ui/index.ts:1-2` 주석에 근거 명시.

**compound 컴포넌트(다중 슬롯 프리미티브):**
- 목적: 슬롯이 3개 이상인 프리미티브는 단일 props API로 접지 않고 서브컴포넌트를 그대로 노출
- 예시: `frontend/src/shared/ui/Tabs.tsx` — `export const Tabs = { Root, List, Tab, Panel }` (`Tabs.Root`/`Tabs.List`/`Tabs.Tab`/`Tabs.Panel`로 사용)
- 대비: 슬롯이 적은 프리미티브는 props로 변이를 받는다 — `frontend/src/shared/ui/Button.tsx`의 `variant` prop

**정적 클래스명 룩업 객체:**
- 목적: Tailwind가 소스를 정적 문자열로 스캔하므로, 런타임에 조립한 클래스명(``` `btn--${variant}` ```)은 유틸리티가 생성되지 않는다(빌드는 성공, 화면만 무스타일)
- 예시: `frontend/src/shared/ui/Button.tsx:15-28`의 `VARIANT`·`SHAPE` `Record<ButtonVariant, string>`

## 진입점

**HTML 진입점:**
- 위치: `frontend/index.html`
- 트리거: 정적 서빙 시 브라우저가 로드
- 책임: `#root` 컨테이너 제공, `type="module"` 스크립트로 `frontend/src/app/main.tsx` 로드

**JS 진입점:**
- 위치: `frontend/src/app/main.tsx`
- 트리거: 모듈 로드 시 즉시 실행(top-level)
- 책임: `#root` 존재 확인(비단언, 명시적 에러 throw) → CSS 1회 import(`@/shared/ui/styles.css`) → `createRoot` 마운트

**빌드 진입점(Vite):**
- 위치: `frontend/vite.config.ts`
- 책임: React 플러그인, Tailwind Vite 플러그인(`optimize:false`), 커스텀 `assertProductionBuild` 플러그인(`apply:"build"`), `resolve.tsconfigPaths:true`로 `@/*` 별칭 해석, `build.target:["chrome111","edge111"]` 명시, `test.environment:"jsdom"` + `setupFiles:"./src/setupTests.ts"`

## 경로 별칭 설계

`frontend/tsconfig.app.json:18` — `"paths": { "@/*": ["./src/*"] }`, **`baseUrl` 미사용**(TypeScript 7이 `baseUrl`을 제거했기 때문 — `frontend/docs/architecture/layers.md` §3.1). Vite는 별도 `resolve.alias` 없이 `resolve.tsconfigPaths: true`(`frontend/vite.config.ts:65-69`)로 같은 `paths` 선언을 읽는다 — 별칭 정의가 한 곳(`tsconfig.app.json`)에만 존재.

**적용 규약**(코드 준수 확인됨 — `Grep '^import'` 결과 전건 일치):
| 범위 | 형식 |
|---|---|
| 슬라이스·세그먼트 내부 | 상대 경로(예: `./Button`, `../doc-parts`, `./sections/FoundationSection`) |
| 슬라이스 밖(레이어 교차 포함) | `@/` 별칭(예: `@/shared/ui`, `@/pages/style-guide`) |

## 경계 강제 설계(oxlint)

강제 도구: **oxlint**(`dependency-cruiser` 아님 — 저장소에 미설치, `frontend/package.json`에 없음). 설정 원문: `frontend/.oxlintrc.json`.

**top-level 규칙:**
- `import/no-cycle: error` — 순환 import 차단
- `no-restricted-imports` — 공통 패턴 2종:
  1. `group: ["@/{entities,features,pages}/*/**"]` — 슬라이스 내부 파일 직접 import 차단(루트 `index.ts`만 허용)
  2. `regex: "^\\.\\.(/\\.\\.)*/(app|pages|features|entities|shared)(/|$)"` — 별칭 우회(상대 경로로 레이어를 넘는 것) 차단

**레이어별 override**(`frontend/.oxlintrc.json:36-151`) — `src/shared/**`, `src/entities/**`, `src/features/**`, `src/pages/**` 4개, 각각 공통 패턴 2종 + 그 레이어 전용 상향/교차 import 금지 목록을 반복 선언:

| override 대상 | 추가로 금지하는 것 |
|---|---|
| `src/shared/**` | `@/app/**`·`@/pages/**`·`@/features/**`·`@/entities/**` 전부(shared는 최하층) |
| `src/entities/**` | 〃(entities는 상위 레이어·다른 entity 슬라이스 금지) |
| `src/features/**` | `@/app/**`·`@/pages/**`·`@/features/**`(다른 feature 포함) |
| `src/pages/**` | `@/app/**`·`@/pages/**`(다른 page 포함) |

`**/*.test.ts(x)` override는 별도로 `eslint/require-await`만 끈다(경계 규칙과 무관).

**⚠️ 구조적 함정(설정 자체의 동작, `frontend/docs/architecture/layers.md` §4.3에 실측 기록됨):** oxlint의 `overrides[].rules`는 같은 규칙 이름을 **병합이 아니라 완전히 대체**한다. 따라서 공통 패턴 2종이 모든 override에 반복 선언돼 있는 것은 중복이 아니라 **필수** — 새 override를 추가하며 공통 패턴을 빠뜨리면 그 레이어만 조용히 무방비가 된다.

**실측(2026-08-21, 이번 매핑 세션에서 직접 실행):** `npx oxlint --format=json .` → `number_of_files: 24`, `number_of_rules: 297`, `diagnostics: []`.

## 아키텍처적 제약

- **레이어 실재성:** `.oxlintrc.json`의 override는 `entities`·`features` 레이어 규칙을 이미 선언하지만, 두 디렉터리는 `frontend/src/`에 실존하지 않는다. 이 두 레이어가 생기면 override는 즉시 유효해진다(추가 설정 불필요).
- **shared 세그먼트 단일성:** `shared/`는 현재 `ui/` 세그먼트만 가진다. FSD 표준은 `api`·`model`·`lib`·`config`도 허용하나 해당 디렉터리는 없다.
- **CSS 배럴 예외:** `shared/ui/index.ts`가 `styles.css`·`theme.css`를 재수출하지 않는다 — 소비자(`app/main.tsx`)가 깊은 경로로 직접 import한다. oxlint의 슬라이스 공개 API 강제는 `.css` 확장자를 예외 처리하지 않았고(`frontend/docs/architecture/layers.md` §4.2에 "후속 개선 항목"으로 명시), 대신 `shared/**` override에는 애초에 "슬라이스 내부 직접 참조 금지" 패턴이 `entities/features/pages`만 겨냥하므로(`@/{entities,features,pages}/*/**`) `shared` 자신의 깊은 경로 import는 오탐 없이 통과한다.
- **전역 상태·전송 계층 부재:** 현재 트리에는 상태 저장소(Zustand 등)도 API 클라이언트도 없다(§데이터 흐름 참조). 스레딩·워커 관련 코드도 없음(확인되지 않음 — `tsconfig.worker.json` 등 미존재, `frontend/docs/architecture/toolchain.md` §5.2도 "적용 대상 없음"으로 명시).

## 안티패턴(이 저장소가 명시적으로 피하는 패턴)

### 런타임 조립 Tailwind 클래스명

**무엇이 문제인가:** ``` `btn--${variant}` ``` 처럼 런타임에 문자열을 이어붙여 클래스명을 만들면, Tailwind가 소스를 정적 텍스트로 스캔하기 때문에 해당 유틸리티가 애초에 생성되지 않는다.
**왜 위험한가:** 빌드는 경고 없이 성공하고 화면만 무스타일이 된다 — 실패가 드러나지 않는다.
**대신 이렇게 한다:** 전체 클래스 문자열을 소스에 그대로 두는 정적 `Record` 룩업 — `frontend/src/shared/ui/Button.tsx:15-28`의 `VARIANT`/`SHAPE` 객체.

### 마운트 지점에 non-null 단언(`!`) 사용

**무엇이 문제인가:** `document.querySelector("#root")!`처럼 단언으로 넘기면, 요소가 없을 때 `createRoot`가 내부에서 불투명한 오류를 던져 원인 파악이 어려워진다.
**왜 위험한가:** 마운트 실패의 원인이 "HTML 구조 변경"이라는 사실이 스택 트레이스에 드러나지 않는다.
**대신 이렇게 한다:** 명시적 null 체크 후 원인을 설명하는 `Error`를 직접 throw — `frontend/src/app/main.tsx:9-12`.

### oxlint `overrides`에 공통 규칙 미반복

**무엇이 문제인가:** oxlint의 override는 같은 이름의 규칙을 병합이 아니라 대체한다. 레이어별 override에 공통 패턴(슬라이스 내부 금지·별칭 우회 차단)을 반복하지 않으면 그 레이어에서 해당 검사가 조용히 사라진다.
**왜 위험한가:** 진단 0건은 "통과"와 "검사 안 됨"을 구분하지 못한다.
**대신 이렇게 한다:** `frontend/.oxlintrc.json`의 4개 override 전부가 공통 패턴 2종을 각자 반복 선언한다(§경계 강제 설계 표 참조).

## 오류 처리

**전략:** 렌더 트리 최상단에 클래스 컴포넌트 기반 에러 바운더리 1개.

**패턴:**
- `frontend/src/shared/ui/ErrorBoundary.tsx` — `getDerivedStateFromError`/`componentDidCatch` 구현. `main.tsx`가 `<App/>`을 감싼다.
- 잡히는 범위: 렌더 중 예외만. 이벤트 핸들러·비동기 콜백 예외는 통과(컴포넌트 자체 주석에 명시).
- `onError` 콜백과 `fallback` 렌더 프롭을 옵션으로 제공하나, 현재 `main.tsx`는 둘 다 지정하지 않고 기본 UI를 사용.
- 로깅: `console.error("[ErrorBoundary] 렌더 중 예외:", ...)` 외 별도 로깅 서비스 연동 코드 없음(확인되지 않음).

## 교차 관심사

**로깅:** `console.error` 1곳(`ErrorBoundary.tsx`) 외 로깅 프레임워크·서비스 연동 없음.
**검증(validation):** 스키마 검증 라이브러리가 `frontend/package.json`에 없고, 폼·입력 검증 코드가 현재 트리에 없음(확인되지 않음).
**인증(authentication):** 인증 관련 코드·라이브러리가 현재 트리·`package.json`에 없음(확인되지 않음).

## 부록 — 문서·과거 코드와 현재 트리의 불일치

이번 매핑 과정에서 확인된, 문서/주석이 현재 트리와 어긋나는 지점이다. 판단 없이 사실만 기록한다.

| 항목 | 내용 |
|---|---|
| `vite-env.d.ts` 주석 | "값을 읽는 곳은 `src/shared/config/env.ts` 하나다"라고 명시하나(`frontend/src/vite-env.d.ts:3`), 해당 파일은 존재하지 않는다. `frontend/docs/README.md:51`이 로드맵 8번 항목에서 "10에서 `shared/config/` 삭제"를 명시적으로 기록해 두었다 — 주석이 삭제 전 상태로 남아 있다. |
| `App.tsx` 주석의 "ADR 0005" | 향후 라우터 도입 결정 문서로 언급되나(`frontend/src/app/App.tsx:11`), `frontend/docs/adr/`에 `0005` 파일이 없다(확인되지 않음 — 아직 작성 전일 수 있다). |
| `git status`상 삭제(D)된 구조 | `frontend/src/app/store/practice-store.ts`, `frontend/src/entities/{answer,coach-feedback,practice-session,question,report}/`, `frontend/src/features/entry-guard/`, `frontend/src/pages/{feedback,practice-session,report}/`, `frontend/src/shared/api/`, `frontend/src/shared/config/` 전부가 삭제 상태이며 현재 워킹트리에 없다. CLAUDE.md·과거 커밋 메시지가 이 구조를 현재형으로 서술하는 경우가 있으나, 실제 트리 기준으로는 미존재. |

---

*Architecture analysis: 2026-08-21*
