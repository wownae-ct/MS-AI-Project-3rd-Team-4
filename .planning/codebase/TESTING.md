# Testing Patterns

**Analysis Date:** 2026-08-21

> 대상: `frontend/src/` (앱 루트 `frontend/`). 제품 주제·도메인은 이번 매핑의 범위 밖이다(추후 확정 예정) —
> 테스트가 검증하는 도메인 규칙은 여기서 제품 사양으로 서술하지 않고, 테스트 기법·구조만 기록한다.
> 수치는 전부 이 세션에서 직접 실행해 센 값이다(추측 없음).

## 테스트 프레임워크

**러너:** Vitest `^4.1.10` (`frontend/package.json` devDependencies). 실제 실행 버전은
`vitest run` 로그 기준 `v4.1.10`.

**설정 위치:** 별도 `vitest.config.*` 파일 없음 — `frontend/vite.config.ts`의 `test` 블록에
직접 정의(`/// <reference types="vitest/config" />` 트리플슬래시 참조로 타입 확보).

```ts
// frontend/vite.config.ts
test: {
  environment: "jsdom",
  globals: true,
  setupFiles: "./src/setupTests.ts",
  exclude: ["**/node_modules/**", "**/dist/**"],
},
```

- `environment: "jsdom"` — jsdom `^30.0.1`(devDependencies). 이 패키지가 저장소 전체 Node 버전 하한
  (`^24.15.0`)을 결정한다(`frontend/docs/architecture/toolchain.md` §2.1).
- `globals: true` — `describe`/`it`/`expect` 등을 import 없이 전역으로 사용 가능(단, 실제 테스트
  파일은 명시적으로 `from "vitest"` import도 함께 쓴다 — 아래 참조).
- `setupFiles: "./src/setupTests.ts"` — 전체 테스트 실행 전 1회 로드.

**setup 파일 전문** (`frontend/src/setupTests.ts`):
```ts
import "@testing-library/jest-dom/vitest";
```
`@testing-library/jest-dom`(devDependencies `^7.0.1`)의 vitest 전용 진입점을 import해 `expect`에
DOM 매처(`toBeInTheDocument`·`toHaveAttribute`·`toHaveFocus` 등)를 추가한다. 이 한 줄 외의 전역 설정
(예: MSW, 전역 mock)은 없다.

**어서션 라이브러리:** Vitest 내장 `expect` + `@testing-library/jest-dom` 매처 확장. 별도 어서션
라이브러리(chai 직접 사용 등) 없음.

**타입 설정:** `frontend/tsconfig.app.json`의 `compilerOptions.types`에 `"vitest/globals"` 포함
— 전역 `describe`/`it`/`expect`가 타입 체크를 통과하게 하는 선언.

## 실행 명령

```bash
cd frontend
npm test                              # vitest run — 전체 스위트 1회 실행 (CI/커밋 전 게이트)
npx vitest                            # watch 모드
npx vitest run src/app/App.test.tsx   # 파일 하나만
npx vitest run -t "헤더 병합"          # 이름 부분 매칭 (describe/it 문자열)
```

`npm test`는 `vitest run`으로 정의됨(`frontend/package.json` scripts). watch 전용 별도 스크립트는
없음 — `npx vitest`를 직접 호출해야 watch 모드가 된다.

**검증 순서 관례:** `typecheck → lint → test → build` 4게이트 중 3번째. `test`는 `build`(`tsc -b && vite build`)
보다 먼저 돌리는 것이 이 저장소의 관례다(빠른 실패 우선).

## 실측 기준선 (2026-08-21, 이 세션에서 직접 실행)

```
$ npx vitest run
 Test Files  2 passed (2)
      Tests  13 passed (13)
```

**테스트 파일 목록 (전수, `find src -iname "*.test.*"`로 확인):**
- `frontend/src/app/App.test.tsx`
- `frontend/src/pages/style-guide/ui/StyleGuidePage.test.tsx`

다른 슬라이스(`shared/ui/*`, `pages/style-guide/ui/sections/*`, `pages/style-guide/ui/doc-parts.tsx`)에는
현재 테스트 파일이 없다 — 아래 "커버리지 공백" 참조.

## 테스트 파일 조직

**위치:** co-location. 테스트 파일은 대상 소스 파일과 **같은 디렉터리**에 `<대상>.test.tsx`로 존재한다.
별도 `__tests__/` 디렉터리나 `test/` 최상위 디렉터리를 쓰지 않는다.
```
src/app/App.tsx
src/app/App.test.tsx
src/pages/style-guide/ui/StyleGuidePage.tsx
src/pages/style-guide/ui/StyleGuidePage.test.tsx
```

**명명:** `<PascalCase 대상명>.test.tsx`. 대상이 `.tsx`(컴포넌트)면 테스트도 `.tsx`.

## 테스트 구조

**Suite 조직 — `describe` 블록을 "화면 영역"이 아니라 "검증하는 계약 단위"로 나눈다.**
`frontend/src/pages/style-guide/ui/StyleGuidePage.test.tsx`에서 관찰되는 실제 구조
(도메인 문자열은 일반화해 표기):

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StyleGuidePage } from "./StyleGuidePage";

describe("<화면> 골격", () => {
  it("제목과 본문 건너뛰기 링크를 제공한다", () => { /* render + role 쿼리 단언 */ });
  it("주요 절을 h2 로 구성한다 — 제목 위계를 건너뛰지 않는다", () => { /* getAllByRole 개수 단언 */ });
});

describe("<개별 컴포넌트> 규범", () => {
  it("...", () => { /* ... */ });
});

describe("탭 — 키보드 접근성", () => {
  it("첫 탭이 선택된 상태로 시작한다", () => { /* ... */ });
  it("화살표 키는 포커스만 옮긴다 — 지나치는 탭을 활성화하지 않는다", async () => {
    const user = userEvent.setup();
    render(<StyleGuidePage />);
    await user.click(screen.getByRole("tab", { name: "..." }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "..." })).toHaveFocus();
  });
});
```

**패턴 요약:**
- `describe` 이름은 "무엇을 검증하는가"를 한국어 문장으로 서술(테스트 그룹 = 계약 단위).
  개별 `it` 이름도 완결된 한국어 문장으로 "왜 이 동작이 맞는지"까지 서술하는 경우가 많다
  (예: "값을 주지 않으면 불확정 상태다 — 0%로 단정하지 않는다").
- 각 `it` 내부에서 `render(<Component />)`를 매번 새로 호출한다 — `beforeEach`로 공유 렌더를 두지
  않는다(관찰된 2개 파일 모두 setup/teardown 훅을 쓰지 않음. `beforeEach`/`afterEach`/`beforeAll` 사용
  없음).
- 비동기 상호작용(`userEvent`)이 있는 테스트만 `it`의 콜백을 `async`로 선언하고 `await user.xxx()`를 쓴다.
  나머지는 동기 콜백.

## Query 전략 — 접근성 트리 기반, 구현 세부사항 회피

**명시된 규칙** (`StyleGuidePage.test.tsx` 파일 상단 주석):
> "셀렉터는 role/label/text 만 쓴다. 클래스명·data-testid·스냅샷을 쓰지 않는다 — 스타일을 바꿀 때마다
> 테스트가 깨지면 테스트가 리팩터링을 막는 족쇄가 된다."

이 규칙은 실제로 코드 전체에서 지켜진다 — `frontend/src` 전체를 `data-testid`·`toMatchSnapshot`으로
검색한 결과 매치 0건(이 주석 자체 제외). 사용되는 쿼리 형태:

- `screen.getByRole("heading", { level: 1, name: "..." })` — 제목 레벨 + 접근명 동시 지정
- `screen.getByRole("link", { name: "..." })` — 스킵 링크처럼 `sr-only`라 시각적으로 안 보여도
  접근성 트리 존재를 검증
- `screen.getAllByRole("heading", { level: 2 })` — 개수 기반 단언(`toBeGreaterThanOrEqual`)
- `screen.getByRole("progressbar", { name: "..." })` — Base UI가 부여하는 `aria-*` 속성 검증
  (`toHaveAttribute("aria-valuenow", "35")`, 또는 부재 검증 `not.toHaveAttribute("aria-valuenow")`)
- `screen.getByRole("tab", { name: "..." })` / `screen.getByRole("tabpanel")` — 탭 상태
  (`aria-selected`)와 포커스(`toHaveFocus()`) 동시 검증
- `screen.getByText("...")` — 짧은 리터럴 텍스트 존재 확인(예: 금액 표기, 라벨 텍스트)

**키보드 전용 상호작용 검증** — 마우스 없이 완주 가능한지를 명시적으로 테스트한다:
```tsx
await user.click(screen.getByRole("tab", { name: "..." }));
await user.keyboard("{ArrowRight}{Enter}");
expect(screen.getByRole("tab", { name: "..." })).toHaveAttribute("aria-selected", "true");
```
`@testing-library/user-event`(devDependencies `14.6.5`, 정확 핀)의 `userEvent.setup()` + `.click()`/`.keyboard()`
조합.

## 조립(Assembly) 테스트 패턴

`frontend/src/app/App.test.tsx`는 화면 세부 동작이 아니라 **app 조립이 실제로 이어져 있는가**만
고정하는 별도 성격의 테스트다:
```tsx
describe("App 조립", () => {
  it("...", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "..." })).toBeInTheDocument();
  });
  it("본문 영역이 main 랜드마크로 노출된다", () => {
    render(<App />);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
```
이 파일 상단 주석은 "지금 App이 하는 일이 단순해서 화면 흐름이 아니라 조립 자체를 고정하는 것이
목적"이라고 명시한다 — 라우터가 도입되면 이 파일의 성격이 라우팅 검증으로 바뀔 예정이라는 주석이
함께 있다(`frontend/src/app/App.test.tsx:1-5`).

## 모킹

**현재 모킹 없음.** `frontend/src` 전체에서 `vi.mock`·`vi.fn`·`vi.spyOn`·`jest.mock` 매치 0건
(2026-08-21 세션에서 grep으로 확인). 두 테스트 파일 모두 실제 컴포넌트를 그대로 렌더하고
`@testing-library/user-event`로 실제 DOM 이벤트를 발생시킨다 — 네트워크·타이머·브라우저 API를
스텁하는 코드가 현재 트리에 없다(API 호출 계층 자체가 현재 `src`에 존재하지 않음).

**Mock 프레임워크는 Vitest 내장 `vi`**(별도 mocking 라이브러리 미설치) — 사용 시점이 오면 이것을 쓸
것으로 예상되나, 현재 사용 사례로 검증된 패턴은 없음("확인되지 않음"으로 남김).

## Fixtures / 테스트 데이터

**전용 fixture 파일이나 factory 함수 없음.** 두 테스트 파일 모두 리터럴 값을 테스트 코드 안에 직접
쓴다(예: 특정 금액 문자열, 탭 라벨 문자열을 `it` 블록 내부에 하드코딩). 별도 `fixtures/`·`__mocks__/`
디렉터리는 `frontend/src`에 존재하지 않는다.

## 커버리지

**커버리지 스크립트 없음** — `frontend/package.json`의 `scripts`에 `coverage`류 명령이 없고,
`vite.config.ts`의 `test` 블록에 `coverage` 옵션이 설정돼 있지 않다.

**커버리지 프로바이더 패키지는 lockfile에만 존재한다.** `frontend/package-lock.json`에
`@vitest/coverage-istanbul`·`@vitest/coverage-v8` 항목이 있으나(둘 다 `4.1.10`), `package.json`의
`devDependencies`에는 없다 — Vitest 자신의 선택적 의존성 트리에 잠긴 것으로 보이며, 커버리지가
실제로 설정·실행되는 경로는 이 저장소에 없음(**확인되지 않음** 항목으로, 추측하지 않음).

**커버리지 목표치:** 문서화된 수치 없음("확인되지 않음").

## 테스트 유형

**컴포넌트/조립 단위 테스트만 존재** — React Testing Library(`@testing-library/react` `^16.3.2`)로
컴포넌트를 렌더하고 접근성 트리 기반으로 단언하는 형태. 이 저장소에서는 별도로 "unit"과
"integration"을 디렉터리나 명명으로 구분하지 않는다(테스트 파일 2개 모두 같은 스타일).

**E2E 프레임워크:** 설치되어 있지 않다(Playwright·Cypress 등 `frontend/package.json`에 없음).

## 공통 패턴 요약

**비동기 상호작용 테스트:**
```tsx
it("Enter 로 포커스한 탭을 활성화한다 — 마우스 없이 완주 가능해야 한다", async () => {
  const user = userEvent.setup();
  render(<StyleGuidePage />);
  await user.click(screen.getByRole("tab", { name: "..." }));
  await user.keyboard("{ArrowRight}{Enter}");
  expect(screen.getByRole("tab", { name: "..." })).toHaveAttribute("aria-selected", "true");
});
```

**속성 부재를 명시적으로 검증(단정하지 않음):**
```tsx
it("값을 주지 않으면 불확정 상태다 — 0%로 단정하지 않는다", () => {
  render(<StyleGuidePage />);
  const loading = screen.getByRole("progressbar", { name: "..." });
  expect(loading).not.toHaveAttribute("aria-valuenow");
});
```
이 패턴은 "값이 없는 상태"와 "0인 상태"를 테스트 레벨에서 구분해, 컴포넌트가 둘을 혼동하지 않는지
고정한다.

**Lint와의 상호작용:** `frontend/.oxlintrc.json`의 `overrides`가 `**/*.test.ts`·`**/*.test.tsx`에
`eslint/require-await: "off"`를 적용한다 — `userEvent.setup()`처럼 `async` 함수 내부에 `await`가
없는 경우를 허용하기 위함(`.oxlintrc.json:37-40`).

---

*Testing analysis: 2026-08-21*
