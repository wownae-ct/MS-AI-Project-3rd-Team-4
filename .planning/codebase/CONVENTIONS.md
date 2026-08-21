# Coding Conventions

**Analysis Date:** 2026-08-21

> 대상: `frontend/src/` (앱 루트 `frontend/`). 이 저장소는 브랜치 소유권상 프론트엔드 전용이며,
> 제품 주제·도메인은 이번 매핑의 범위 밖이다(추후 확정 예정). 아래는 컨벤션·품질 사실만 기록한다.
> 현재 `src` 트리는 `app/`, `pages/style-guide/`, `shared/ui/` 세 슬라이스만 가진다(git status상 다수
> 파일이 삭제된 직후 상태) — 여기 적힌 패턴은 전부 이 트리에서 실제로 읽은 코드에 근거한다.

## 명명 규칙

**컴포넌트 파일:**
- PascalCase, export하는 컴포넌트명과 파일명이 1:1로 일치한다.
  예: `frontend/src/shared/ui/Button.tsx` → `export function Button`,
  `frontend/src/shared/ui/Card.tsx` → `export function Card`,
  `frontend/src/shared/ui/ErrorBoundary.tsx` → `export class ErrorBoundary`,
  `frontend/src/pages/style-guide/ui/StyleGuidePage.tsx` → `export function StyleGuidePage`.

**비컴포넌트/유틸 파일:** kebab-case.
  예: `frontend/src/pages/style-guide/ui/doc-parts.tsx` — `Section`·`Rule`·`OpenDecision` 등 여러
  named export를 담고 있어 파일명이 특정 컴포넌트명과 일치하지 않는다(슬라이스 전용 문서 조각 모음).

**섹션·그룹 파일:** 주제별로 여러 컴포넌트를 한 파일에 묶고 파일명은 그룹명 + `Section` 접미사.
  예: `frontend/src/pages/style-guide/ui/sections/ComponentsSection.tsx`(`MoneySection`·`ButtonSection`·
  `BadgeSection`·`ProgressSection`·`TabsSection` 5개 export),
  `frontend/src/pages/style-guide/ui/sections/FoundationSection.tsx`(`ColorSection`·`TypographySection`),
  `frontend/src/pages/style-guide/ui/sections/SystemSection.tsx`(`SurfaceSection`·`FocusSection`·
  `NonGoalsSection`).

**테스트 파일:** `<대상>.test.tsx`, 소스 파일과 같은 디렉터리에 co-locate.
  예: `frontend/src/app/App.test.tsx`(← `App.tsx` 옆), `frontend/src/pages/style-guide/ui/StyleGuidePage.test.tsx`.

**배럴/공개 API 파일:** 슬라이스·세그먼트 루트에 `index.ts`, re-export 전용(로직 없음).
  예: `frontend/src/pages/style-guide/index.ts`(`export { StyleGuidePage } from "./ui/StyleGuidePage"`),
  `frontend/src/shared/ui/index.ts`(모든 프리미티브 + 타입 re-export).

**디렉터리:** kebab-case 슬라이스명(`style-guide`), 소문자 세그먼트명(`ui`, `sections`).

## 컴포넌트 작성 패턴

**함수 선언문을 쓴다** — 화살표 함수 상수(`const Foo = () => ...`)가 아니라 `export function Foo() {}`
형태로 일관된다. 확인한 전부: `Button`·`Card`·`Money`·`Page`·`Progress`·`Badge`·`Tabs`의 `Root/List/Tab/Panel`·
`Section`/`Rule`/`OpenDecision`(`doc-parts.tsx`)·`StyleGuidePage`·`App`.
예외: `ErrorBoundary`(클래스 컴포넌트 — React가 에러 바운더리를 훅으로 제공하지 않아 불가피,
`frontend/src/shared/ui/ErrorBoundary.tsx:3-4` 주석 참조).

**Props 타이핑 — 공개 여부로 갈린다:**
- **공개 컴포넌트(shared/ui 프리미티브):** `export interface <Component>Props` 를 컴포넌트와 함께 export.
  네이티브 HTML 속성을 감쌀 때는 `extends`로 확장한다.
  예: `export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant; block?: boolean; children: ReactNode; }`
  (`frontend/src/shared/ui/Button.tsx:35-40`). 같은 패턴이 `CardProps`·`MoneyProps`·`PageProps`·
  `ProgressProps`·`BadgeProps`·`ErrorBoundaryProps`·`TabsRootProps`에 반복된다.
- **슬라이스 내부 전용 컴포넌트:** named interface를 만들지 않고 인라인 객체 타입을 함수 매개변수에
  직접 쓴다. 예: `frontend/src/pages/style-guide/ui/doc-parts.tsx:6-14`의 `Section`
  (`{ title, hint, children }: { title: string; hint?: string; children: ReactNode }`),
  `frontend/src/shared/ui/Tabs.tsx:40`의 `List`(`{ children, label }: { children: ReactNode; label: string }`).

**JSDoc 프로퍼티 주석** — 인터페이스 멤버마다 `/** ... */`로 용도·제약을 설명한다. 단순 타입 선언이
아니라 "왜 이 옵션이 있는지"까지 적는다. 예: `MoneyProps.unit`(`frontend/src/shared/ui/Money.tsx:16-17`
"단위 표기. 표에서 헤더가 단위를 이미 말할 때는 null 로 끈다"), `PageProps.focusOnMount`
(`frontend/src/shared/ui/Page.tsx:18-24`, 스크린리더 포커스 이동 사유 설명),
`ErrorBoundaryProps.onError`(`frontend/src/shared/ui/ErrorBoundary.tsx:19` "여기서 던지지 말 것 — 바운더리 자신이 깨진다").

**variant 스타일링은 정적 룩업 객체로만** — 절대 템플릿 리터럴로 클래스명을 조립하지 않는다.
```tsx
// frontend/src/shared/ui/Button.tsx:15-20
const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-primary text-surface hover:brightness-110 active:brightness-95",
  secondary: "border-line bg-surface text-ink hover:border-ink-soft hover:bg-bg",
  ghost: "border-transparent bg-transparent text-primary hover:bg-primary-soft",
};
```
같은 형태가 `SHAPE`(같은 파일)에도 쓰인다. 이유는 Tailwind가 소스를 평문 스캔하기 때문 — 런타임 조립
클래스명(`` `btn--${variant}` ``)은 유틸리티가 생성되지 않아 빌드는 성공하고 화면만 무스타일이 된다
(`frontend/src/shared/ui/README.md` "코드 규약" 절, ✗/✓ 예시 포함).

**`className` 병합 패턴** — prop으로 받은 `className`은 항상 `BASE`에 뒤이어 붙이고 대체하지 않는다.
- 단순 병합: `className ? `${BASE} ${className}` : BASE` (`Card.tsx:18`, `Badge.tsx:17`, `Money.tsx:25`)
- 다중 소스 병합: `[BASE, VARIANT[variant], SHAPE[variant], block ? "w-full" : "", className].filter(Boolean).join(" ")` (`Button.tsx:50-52`)

**compound vs props** — 슬롯이 3개 이상이면 compound 패턴(`Tabs.Root/List/Tab/Panel`,
`frontend/src/shared/ui/Tabs.tsx:65`의 `export const Tabs = { Root, List, Tab, Panel }`), 슬롯이 적으면
props 하나로 접는다(`Button variant`). 규칙 출처: `frontend/src/shared/ui/README.md` "코드 규약" 절.

**접근성 프리미티브는 Base UI로 감싼다** — `role`·`aria-*` 동기화·키보드 상호작용을 직접 구현하지 않고
`@base-ui/react`에 위임한다. 예: `Progress`(`frontend/src/shared/ui/Progress.tsx:5,19-23`, `role="progressbar"`
와 `aria-valuemin/max/now` 자동 동기화), `Tabs`(`frontend/src/shared/ui/Tabs.tsx:10`, 로빙 tabindex·화살표 키
순환·`aria-selected`/`aria-controls` 자동 동기화).

**아이콘은 인라인 SVG 컴포넌트** — 외부 아이콘 CDN·라이브러리를 쓰지 않는다.
`frontend/src/shared/ui/icons.tsx`에 `IconCheck`·`IconInfo`·`IconChevronDown` 3종, 공통 속성은 `base()`
헬퍼 함수로 조립(`currentColor`·`aria-hidden` 기본값). 20개를 넘으면 라이브러리 도입 재검토
(파일 상단 주석).

## Import 조직

**순서(3그룹, 파일 전반에서 관찰됨):**
1. 외부 패키지 (`react`의 타입, `@testing-library/*`, `@base-ui/react/*`)
2. `@/` 별칭 교차 슬라이스 import
3. 슬라이스 내부 상대 경로 import (`./Button`, `../doc-parts`)

예: `frontend/src/pages/style-guide/ui/sections/ComponentsSection.tsx:2-3`
```tsx
import { Badge, Button, Card, IconCheck, IconChevronDown, Money, Progress, Tabs } from "@/shared/ui";
import { OpenDecision, Rule, Section } from "../doc-parts";
```

**경로 별칭:** `@/*` → `./src/*`, 정의는 `frontend/tsconfig.app.json`의 `paths` 한 곳뿐
(`baseUrl` 미사용 — TypeScript 7이 `baseUrl`을 제거해 `paths` 단독 선언이 유일한 전방호환 형태).
Vite는 `resolve.tsconfigPaths: true`(`frontend/vite.config.ts`)로 같은 선언을 그대로 읽는다 — 별칭을
두 곳에 적지 않는다.

**규약 — 슬라이스 내부는 상대 경로, 슬라이스 밖은 `@/` 별칭.** 이 규약이 서면 `@/` 지정자의 등장 자체가
"슬라이스를 넘었다"는 신호가 되고, 아래 lint 규칙이 이를 강제한다.

**Lint로 강제되는 import 제약** (`frontend/.oxlintrc.json`):
- `no-restricted-imports` — `@/{entities,features,pages}/*/**` 그룹 금지("슬라이스 밖에서는 루트
  index만 import한다" — public API 우회 차단)
- `no-restricted-imports` — 정규식 `^\.\.(/\.\.)*\/(app|pages|features|entities|shared)(/|$)` 금지
  (슬라이스를 넘는 상대 경로 우회 차단 — 별칭 규약이 전제)
- 레이어별 `overrides`(`src/shared/**`·`src/entities/**`·`src/features/**`·`src/pages/**`)가 위 2종
  공통 패턴 + 레이어별 상향/교차 금지 그룹을 반복 정의한다. **oxlint의 `overrides[].rules`는 top-level
  규칙을 병합이 아니라 대체(replace)한다** — 새 override를 추가할 때 공통 패턴 2종을 빠뜨리면 그 레이어만
  조용히 무방비가 된다(`frontend/.oxlintrc.json:36-151`, 각 override 블록에서 실제로 반복 확인됨).
- `import/no-cycle: "error"` — 순환 import 금지.

**타입 전용 import도 검사 대상이다** — `allowTypeImports`를 설정하지 않은 것이 의도된 기본값이며,
`import type` 형태의 상향/교차 import도 값 import와 동일하게 차단된다.

## 코드 스타일 · Lint

**포매터 없음** — `.prettierrc*`·`.editorconfig`·biome 설정 파일이 저장소에 없다. 포맷 강제는
`oxlint`의 린트 규칙에 한정된다(포매팅 전용 도구는 별도로 없음).

**린터:** `oxlint` (`frontend/package.json` devDependencies, 설치 버전 `^1.78.0`).
설정 파일: `frontend/.oxlintrc.json`.

**실행:** `npm run lint` → `oxlint --deny-warnings .` (경고도 실패로 취급).

**실측 기준선(2026-08-21, 이 세션에서 직접 실행):**
```
$ npx oxlint --format=json .
number_of_files: 24
number_of_rules: 297
diagnostics: 0
```

**`plugins` 배열은 추가가 아니라 대체다** — 기본 활성 4종(`eslint`·`typescript`·`unicorn`·`oxc`)을
`frontend/.oxlintrc.json`의 `"plugins"` 배열에 다시 적지 않으면 그 규칙들이 조용히 꺼진다. 현재 값:
`["eslint", "typescript", "unicorn", "oxc", "import", "react", "jsx-a11y"]`(`.oxlintrc.json:3`).
플러그인 배열을 건드릴 때는 `--format=json`의 `number_of_rules`로 규칙 수를 재확인해야 한다.

**카테고리 전체를 error로 격상:** `correctness`·`perf`·`suspicious`·`pedantic` 4개 카테고리가
`"error"`로 설정됨(`.oxlintrc.json:6-11`).

**개별 규칙 오버라이드(top-level):**
- `import/no-cycle: "error"`
- `react/react-in-jsx-scope: "off"` (React 19 자동 JSX 런타임이라 불필요)
- `import/no-unassigned-import: "off"` (CSS 사이드이펙트 import 허용 목적)
- `eslint/no-inline-comments: "off"` (인라인 주석 허용 — 이 코드베이스는 설명 주석이 많다)
- `eslint/max-lines-per-function: "off"` (함수 줄수 제한 없음 — 섹션 파일처럼 여러 JSX 블록을 가진
  긴 컴포넌트를 허용)

**테스트 파일 전용 완화:** `**/*.test.ts`·`**/*.test.tsx`에서 `eslint/require-await: "off"`
(`.oxlintrc.json:37-40`) — `async` 테스트 함수 내부에 `await`가 없어도 허용(예: `userEvent` 설정 직후
동기 단언만 하는 케이스).

## 에러 처리

**렌더 예외 — ErrorBoundary (클래스 컴포넌트):**
`frontend/src/shared/ui/ErrorBoundary.tsx`. `getDerivedStateFromError`로 상태를 갱신하고
`componentDidCatch`에서 `console.error`로 로깅 + 선택적 `onError` 콜백 호출.
```tsx
componentDidCatch(error: Error, info: ErrorInfo): void {
  console.error("[ErrorBoundary] 렌더 중 예외:", error, info.componentStack);
  this.props.onError?.(error, info);
}
```
기본 fallback UI를 제공하되 `fallback` prop으로 대체 가능. `main.tsx`에서 `<App />` 전체를 감싼다
(`frontend/src/app/main.tsx:16-18`).

**명시된 한계** — 파일 상단 주석에 "잡히지 '않는' 것"을 명시: 이벤트 핸들러·비동기 콜백·SSR에서 던진
예외는 바운더리를 통과한다. 그런 경로는 각자 `try/catch`로 다뤄야 한다는 규범이 코드 주석으로 남아있다
(`ErrorBoundary.tsx:6-7`).

**필수 DOM 요소 부재 — 단언 대신 명시적 에러:** non-null 단언(`!`)을 쓰지 않고 존재 확인 후 설명적
에러를 던진다.
```tsx
// frontend/src/app/main.tsx:9-12
const rootElement = document.querySelector("#root");
if (!rootElement) {
  throw new Error('마운트 지점 "#root"를 찾지 못했다 — index.html의 <div id="root">가 바뀌었는지 확인할 것.');
}
```
주석에 이유가 명시됨: non-null 단언으로 넘기면 `createRoot`가 내부에서 불투명한 오류를 던져 원인이
지워진다.

**빌드 타임 검증 게이트(런타임 에러 처리는 아니지만 같은 "조용히 실패하지 않는다" 원칙):**
- `frontend/vite.config.ts`의 `assertProductionBuild()` 플러그인 — 프로덕션 빌드인데
  `isProduction=false`(즉 `.env`의 `NODE_ENV` 오염)면 `throw new Error(...)`로 빌드 자체를 실패시킨다.
  원인·조치를 메시지에 포함.
- `frontend/scripts/check-bundle-budget.mjs` — 번들 크기 예산 초과, 그리고 산출 CSS의 디자인 규범
  위반(그림자 `box-shadow`, `prefers-color-scheme`)을 발견하면 `process.exitCode = 1`로 빌드를 실패시킨다.
  두 케이스 모두 원인·조치를 콘솔 메시지로 출력한다(예: "산출 CSS 가 디자인 규범을 어겼다" 블록,
  `check-bundle-budget.mjs` 내 `normViolations`/`breaches` 처리부).

**Error 생성 시 `cause` 사용** — 원본 예외를 지우지 않고 `{ cause: error }`로 연결한다.
```js
// frontend/scripts/check-bundle-budget.mjs (collectAssets)
throw new Error([...].join("\n"), { cause: error });
```

## 주석 스타일

**파일 상단 "왜" 블록** — 대부분의 소스 파일이 첫 줄(들)에 그 파일이 존재하는 이유·설계 근거·과거
실측 결과를 한국어로 서술한다. 단순 "무엇을 하는 파일인지"가 아니라 "왜 이 형태인지"를 우선한다.
예: `Card.tsx`의 `@container` 사용 이유, `Tabs.tsx`의 수동 활성화(activateOnFocus: false) 채택 이유와
반례 시나리오, `Money.tsx`의 `Intl.NumberFormat` 모듈 스코프 생성 이유("렌더마다 할 만큼 싸지 않다").

**인라인 주석은 허용된다** (`.oxlintrc.json`의 `eslint/no-inline-comments: "off"`) — 코드 옆에 짧은
설명을 붙이는 패턴이 실제로 쓰인다.

**문서 상호 참조** — 주석이 ADR·설계 문서 절 번호를 직접 인용한다. 예: `Progress.tsx:3`
"Base UI 로 감싼 이유(ADR 0004)", `Button.tsx:5` "(ADR 0003 §결과)".

## 모듈 설계

**Export 방식:** named export가 기본. default export는 `frontend/src/app/App.tsx`
(`export default App`) 한 곳뿐 — `main.tsx`가 import하기 위한 관례적 예외.

**배럴 파일(`index.ts`)은 re-export 전용, 로직을 담지 않는다.**
```ts
// frontend/src/shared/ui/index.ts
export { Badge, type BadgeProps } from "./Badge";
export { Button, type ButtonProps, type ButtonVariant } from "./Button";
// ...
```
타입도 컴포넌트와 함께 named export로 재노출한다(`export { X, type XProps } from "./X"` 패턴).

**CSS는 배럴에서 재수출하지 않는다** — 사이드이펙트 import라 `index.ts`를 경유하면 항상 실행되는
것을 보장할 수 없다. `frontend/src/shared/ui/styles.css`는 `main.tsx`가 깊은 경로로 직접 import한다
(`frontend/src/app/main.tsx:4`). `frontend/src/shared/ui/README.md:18`에 이유가 명시됨.

**Public API 강제 범위의 현재 공백** — `entities`·`features`·`pages`의 슬라이스 내부 강제는 lint로
적용되지만, `shared` 세그먼트(예: `shared/ui`) 자체의 공개 API 강제는 아직 lint 규칙으로 넣지 않았다
(CSS 예외 처리가 필요해 후속 과제로 남아 있음 — 근거: `frontend/docs/architecture/layers.md` §4.2).

---

*Convention analysis: 2026-08-21*
