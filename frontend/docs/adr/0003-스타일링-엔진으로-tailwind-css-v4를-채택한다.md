# 0003. 스타일링 엔진으로 Tailwind CSS v4를 채택하고 DESIGN.md 토큰을 @theme로 옮긴다

- 상태: **승인**
- 날짜: 2026-08-21 · 결정자: gunny (프론트 담당) · 합의 채널: —
- 설계서 관련 절: 설계서(`docs/frontend_architecture_v3.7.md`)는 툴체인만 규정하고 **스타일링 방법론은 규정하지 않는다.** 규범이 열어둔 재량 사항이다.
- 선행 의존: 0001 (경계 강제 oxlint 일원화) — 스타일 파일 배치가 그 경계 규칙의 제약을 받는다.
- 값의 출처: 저장소 히스토리의 제품·디자인 문서 (커밋 `558a463`)

## 맥락

**이 프로젝트는 주제가 바뀌었고, 새 주제는 아직 확정되지 않았다.** `frontend` 브랜치의 코드와 문서는 이전 주제 세대에 머물러 있어 프론트엔드를 새로 세워야 하는 상태였다.

지금 프론트엔드에는 두 가지가 동시에 있다.

**첫째, 디자인 값은 확보돼 있다.** 저장소 히스토리의 디자인 문서(`git show 558a463:DESIGN.md`)가 유일한 값의 출처다. 베리 플럼 `#8B3F63` 단일 포인트 컬러, Wanted Sans Variable, **그림자 없이 1px 헤어라인 보더만**, 라운드 8/10/999px. `design/tokens.css` 주석이 배치 지시까지 남겨 놨다 — *"프론트엔드 브랜치에서 실구현할 때 전역으로 import"*.

**둘째, 그 시스템을 강제할 장치가 없다.** 이 저장소는 「조용한 실패 방치 금지」를 일관 원칙으로 삼고 게이트로 강제한다 — `engine-strict`, `--deny-warnings`, `assert-production-build`, `--if-present` 금지. 각각 실사고를 막은 이력이 있다. 그런데 **스타일 레이어만 그 원칙 밖에 있다.** 디자인 문서가 "베리 플럼 하나만 쓴다", "그림자 금지"라고 아무리 적어 놔도, 하드코딩된 색도 오타 클래스도 4게이트를 전부 통과한다.

기존 `src/shared/ui/tokens.css`(75줄)·`components.css`(250줄)는 이전 주제 세대의 수제 바닐라 CSS였다. 값은 녹색 계열이고 그림자를 쓰며 다크모드를 갖는다 — **현재 디자인 규범과 정면으로 어긋난다.** 살릴 것이 없다.

지금이 결정 시점인 이유 — 화면을 짓기 전이 스타일 기반을 정할 가장 싼 시점이다. 화면을 먼저 만들고 나중에 엔진을 바꾸면 같은 화면을 두 번 쓴다.

## 검토한 대안

주간 다운로드는 npm registry API 실측(2026-08-21).

| 대안 | 최신 · 주간 DL | 장점 | 단점 | 기각 사유 |
|---|---|---|---|---|
| **현행 유지 + 바닐라 CSS 현대화** — `@layer` · `@property` · 컨테이너 쿼리 직접 작성 | — | 의존성 0 · 번들 최소 · 하한 완전 통제 | 유틸리티·반응형·포커스를 전부 손으로 · **토큰 규율을 강제할 도구가 없다** | 기각 — 현대 CSS 기능은 어느 대안을 골라도 쓸 수 있어 이 대안만의 이점이 아니다. "스타일만 게이트 밖"이라는 출발점 문제가 그대로 남는다 |
| **UnoCSS** | 66.8.0 · 386,797 | Tailwind 호환 프리셋 · 빌드 속도 | 채택률이 **Tailwind의 1/274** · Base UI 등 주변 생태계가 Tailwind를 전제 | 기각 — "2026엔 UnoCSS를 기본으로"라는 블로그 주장이 여럿 보이나 실측 채택률이 뒷받침하지 않는다. 빌드 속도 이점은 이 규모에서 체감되지 않는다 |
| **StyleX** | 0.19.0 · 1,418,064 | Meta 실전 검증 · 대규모 디자인 시스템 지향 | 수년째 **pre-1.0** | 기각 — `--deny-warnings` CI에 0.x를 스타일 기반으로 물리지 않는다 |
| **vanilla-extract** | 1.21.2 · 2,488,505 | zero-runtime · `tsc -b` 게이트가 스타일까지 커버 | `.css.ts`가 슬라이스 내부에 생기는데 **0001의 경계 규칙이 슬라이스 밖 참조를 막고, CSS는 사이드이펙트라 `index.ts`로 재수출할 수 없다**([layers.md §4.2](../architecture/layers.md)) | 기각 — 타입 안전의 이득보다 배치 제약이 크다. 미해결 항목 E(`.css` 예외 정규식)를 먼저 풀어야 성립하는데 oxlint는 Rust 정규식이라 lookahead를 못 쓴다 |
| **Panda CSS** | 1.12.0 · 374,959 | 토큰 우선 설계 · recipes · 타입 안전 | **`styled-system/` 생성 디렉터리 필수** → ① `frontend/.gitignore` 신설 필요(루트는 path-guard가 차단) ② `ignorePatterns` 확장 필요 ③ `noUnusedLocals` 충돌 가능 | 기각 — 생성 코드 디렉터리가 이 저장소의 린트·경계·경로 규약과 3중으로 마찰한다 |
| **Tailwind CSS v4** | 4.3.3 · **105,971,517** ← 채택 | **생성 디렉터리 없음** · 설정 파일 없음(CSS `@theme`가 토큰 단일 출처) · 하한이 현행 `build.target`과 정확히 일치 · Vite 8 공식 지원 | 런타임 조립 클래스명이 동작하지 않는다 · Preflight가 기존 리셋을 대체한다 | — |

## 결정

**Tailwind CSS v4를 스타일링 엔진으로 채택하고, `DESIGN.md`의 토큰을 `@theme`로 옮긴다.** 값을 발명하지 않고 옮기기만 한다.

요지는 넷이다.

### 1. `--color-*: initial`로 기본 팔레트를 폐기한다 — 이것이 채택의 결정적 이유

Tailwind의 기본 팔레트(22색 × 11단계)를 지우면 `bg-red-500` 같은 저장소 밖 색상이 **아예 생성되지 않는다.** DESIGN.md의 **The One Accent Rule**("베리 플럼은 FOCUS 배지·주요 버튼·강조 텍스트에만. 배경 워시, 큰 면적 채우기로 쓰지 않는다 — 희소성이 곧 그 색의 힘이다")이 사람의 규율에서 **도구의 구조**로 옮겨간다. 다른 대안은 이 성질을 주지 못한다.

### 2. 브라우저 하한이 이미 맞다

Tailwind v4의 요구 하한은 Chrome 111 / Safari 16.4 / Firefox 128이고, 이 저장소의 `build.target`은 `["chrome111","edge111"]`이다. 하한을 낮추지도, 새로 협상하지도 않는다. 다만 **Tailwind가 유틸리티를 생성해 준다고 이 하한에서 동작하는 건 아니다** — 아래 「하한 매트릭스」가 리뷰 체크리스트다.

### 3. 스케일은 Tailwind 기본을 따르고, DESIGN.md가 정한 것만 덮어쓴다

| 항목 | 처리 | 근거 |
|---|---|---|
| `--color-*` | DESIGN.md 값으로 **전면 교체**(기본 팔레트 폐기 후) | DESIGN.md가 SSOT |
| `--radius-sm/md/pill` | `8/10/999px`로 **덮어씀** (Tailwind 기본은 4/6/8px) | DESIGN.md가 명시한 값이다. 이 저장소에서 `rounded-md`=10px임을 `shared/ui/README.md`에 남긴다 |
| `--font-sans` | Wanted Sans Variable 스택으로 **덮어씀** | Tailwind 기본 스택에 한글 폴백이 없다 |
| `--spacing` | Tailwind 기본 `0.25rem` **유지** | DESIGN.md의 xs/sm/md/lg/xl(4/8/16/20/24px)이 전부 4px 그리드 위라 `p-1 p-2 p-4 p-5 p-6`으로 정확히 표현된다 → **토큰을 이중으로 두지 않는다** |
| `--breakpoint-*` | Tailwind 기본 **유지** | DESIGN.md가 정하지 않았다. 지어내지 않는다 |

토큰 **이름**은 DESIGN.md 그대로 쓴다. `bg-bg`가 어색해 보여도 SSOT와 1:1이라 DESIGN.md가 바뀌면 그대로 따라간다. 이름을 다듬으면 추적성이 끊긴다.

### 4. `optimize: false`로 lightningcss를 한 번만 돌린다

Vite 8은 `build.cssMinify` 기본이 lightningcss이고 `build.cssTarget`(기본값 = `build.target`)이 `css.lightningcss.targets`보다 우선한다(공식 config 문서). Tailwind의 vite 플러그인도 **자체 하한**으로 lightningcss를 돌리므로, 그대로 두면 다운레벨 타깃이 두 곳으로 갈린다 — 이 저장소가 별칭(0001)·Node 버전(0002)에서 일관되게 거부해 온 패턴이다.

### 설치 전 실측 검증 (2026-08-21)

근거 없이 반영한 항목은 없다.

| 항목 | 결과 |
|---|---|
| `@tailwindcss/vite@4.3.3` peer | `vite: ^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8` → 현행 `vite@8.2.1` **통과** |
| Vite 8 지원 시점 | v4.2.2 (2026-03-18) 릴리스 노트 — "Support Vite 8 in `@tailwindcss/vite`" ([#19790](https://github.com/tailwindlabs/tailwindcss/pull/19790)) |
| `@tailwindcss/oxide@4.3.3` engines | `node: ">= 20"` → `engine-strict=true` + Node 24.19 **통과** |
| ERESOLVE 위험 | 없음 — `overrides`·`--legacy-peer-deps` 불필요 (실제 설치로 확인) |
| 생성 코드 디렉터리 | **없음** → `frontend/.gitignore` 신설 불필요, `ignorePatterns` 확장 불필요 |
| PostCSS | 불필요 — `@tailwindcss/vite`가 Vite와 직접 통합. `postcss.config.*` 신설 안 함 |
| `@source` 경로 강제 | `source(none)` + 명시 `@source`가 실제로 동작함을 확인 — `index.html` 전용 클래스와 `src/**` 전용 클래스가 각각 산출 CSS에 나왔다 |
| 팔레트 폐기 | `--color-*: initial` 이후 `bg-red-500`을 소스에 두어도 산출 CSS에 **생성되지 않음**을 확인 |

### 하한 매트릭스 — 생성된다고 쓸 수 있는 건 아니다

| CSS 기능 | 최소 Chrome | `chrome111`에서 |
|---|---|---|
| `@property` · `color-mix()` · `oklch()` · 캐스케이드 레이어 · 컨테이너 쿼리 · `:has()` | ≤111 | 사용 |
| `@starting-style` | 117 | **금지** — Base UI의 `data-starting-style` **속성**으로 대체(0004) |
| `light-dark()` · `field-sizing` | 123 | **금지** (다크모드 자체가 스코프 밖이라 무의미하기도 하다) |
| 앵커 포지셔닝(`anchor-*`) | 125 | **금지** |

금지 항목을 쓰면 하한 미만에서 **조용히 무시된다.** 빌드도 린트도 잡지 않는다.

### 성능에 대한 정직한 기록

`optimize: false`의 실제 이득을 측정했다. 같은 소스로 두 번 빌드해 산출 CSS를 비교했다(2026-08-21).

| 설정 | raw | gzip |
|---|---|---|
| `tailwindcss({ optimize: false })` — Vite의 lightningcss만 실행 | **11,891 B** | **3,494 B** |
| `tailwindcss()` — Tailwind와 Vite가 각각 실행 | 11,955 B | 3,496 B |
| 차이 | −64 B (−0.54%) | −2 B (−0.06%) |

**크기 이득은 사실상 없다.** gzip 기준 2바이트다. 이 설정을 택하는 근거는 성능이 아니라 **다운레벨 타깃의 단일 출처 유지**이며, 그 점을 숫자로 부풀리지 않는다. 크기가 판단 근거였다면 채택할 이유가 없었다.

### 산출 CSS 의 구성 — 77%가 폰트 선언이다

스타일가이드 기준 산출 CSS 를 분해했다(2026-08-21).

| 구성 | raw | gzip |
|---|---|---|
| `@font-face` 92개 (Wanted Sans split, `unicode-range` 포함) | 46,264 B (**77.4%**) | ≈13,400 B |
| Preflight + 유틸리티 + base 레이어 | 13,525 B | 3,683 B |
| 합계 | 59,789 B | 17,059 B |

**Tailwind 가 만든 CSS 자체는 13.5 kB(gzip 3.7 kB)로 작다.** 부피의 대부분은 폰트 서브셋 선언이며, 이는 렌더 블로킹 CSS 다. 그 대가로 브라우저가 **실제 쓰는 글자 조각만** 내려받는다 — complete 판(단일 1.29 MB woff2, 한 글자만 써도 전량 다운로드)보다 전체 전송량이 훨씬 작다. 이 트레이드오프는 의도한 것이다.

화면이 늘어도 이 77% 부분은 그대로이고 유틸리티 쪽만 완만히 증가한다(Tailwind 는 클래스를 재사용한다). 따라서 **CSS 예산은 폰트와 분리해서 잰다** — 합산하면 폰트가 예산을 다 먹어 유틸리티 증가를 감지하지 못한다.

### 검증 스크립트의 함정 — 실제로 걸렸다

산출 CSS 를 `grep box-shadow` 로 검사했더니 1건이 나와 「Flat-By-Default 위반」으로 오판할 뻔했다. 실제 내용은 Preflight 의 `:-moz-ui-invalid{box-shadow:none}` 으로, **그림자를 제거하는** 코드였다. 마찬가지로 `border-radius:999px` 를 찾아 `rounded-pill` 이 생성되지 않았다고 오판할 뻔했는데, Tailwind 는 리터럴이 아니라 `border-radius:var(--radius-pill)` 로 낸다 — 토큰 변경이 전파되게 하려는 설계다.

→ 검증은 **속성 이름이 아니라 값까지** 보고, 토큰은 **`var(--토큰)` 참조로** 확인한다. 이 규칙을 번들 예산 스크립트와 문서의 검증 절에 반영한다.

## 결과

**쉬워지는 것**

- DESIGN.md의 One Accent Rule이 구조로 강제된다 — 팔레트 밖 색은 CSS가 생성되지 않아 화면에서 즉시 드러난다.
- 반응형 · 컨테이너 쿼리 · `:focus-visible`이 유틸리티로 해결된다. 도입 전 CSS 전체에 `:focus-visible`이 **0건**이었다.
- 설정 파일이 늘지 않는다. `tailwind.config.js`도 `postcss.config.js`도 만들지 않는다.
- DESIGN.md가 바뀌면 `theme.css` 한 파일만 고치면 된다.

**어려워지는 것**

- **런타임 조립 클래스명이 금지된다.** Tailwind는 소스를 평문 스캔한다 — 공식 문서 원문: *"Tailwind treats all of your source files as plain text, and doesn't attempt to actually parse your files as code in any way."* 템플릿 리터럴로 조립한 클래스는 찾지 못하고 유틸리티가 생성되지 않는다. **빌드는 성공하고 화면만 무스타일이 된다.** 변이는 정적 룩업 객체로만 쓰고, 불가피하면 `@source inline(...)`으로 세이프리스트하고 이유를 주석에 남긴다.
- 자동 소스 탐지의 기준점이 **현재 작업 디렉터리**라 실행 위치가 달라지면 클래스가 조용히 누락된다. `source(none)` + 명시 `@source`로 못 박는다.
- Preflight가 기존 리셋을 대체하므로 전 컴포넌트 재스타일이 전제다.
- 마크업에 유틸리티가 늘어 JSX 가독성이 낮아진다. 클래스 정렬 도구(oxfmt `sortTailwindcss`)는 별건으로 미룬다.

**되돌리려면**

`theme.css`·`styles.css`를 바닐라 CSS로 재작성 + 프리미티브 8종의 className 원복 + `vite.config.ts` 플러그인 제거 + 의존성 2개 제거. 마크업 구조(role·aria)와 DESIGN.md 토큰 값 자체는 영향받지 않는다 — 값의 출처가 DESIGN.md이지 Tailwind가 아니기 때문이다.

**검증 방법**

1. 4게이트(`typecheck → lint → test → build`)를 `--legacy-peer-deps`·`overrides` 없이 통과
2. 산출 CSS에 `bg-red-500` **0건** — 팔레트 폐기 동작 확인
3. 산출 CSS에 `box-shadow` **0건** — DESIGN.md의 Flat-By-Default Rule 준수
4. 산출 CSS에 `prefers-color-scheme` **0건** — 다크모드가 스코프 밖임을 확인
5. 산출 JS에 개발자 PC 절대 경로 0건, `jsxDEV` 0건 — `assert-production-build` 유지 확인
6. 번들 예산 스크립트 exit 0
