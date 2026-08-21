# 구현 계획

> **최종 갱신** 2026-08-21 (v2 — 초판 감사 후 전면 개정) · **상태: 실행 중.** 완료한 커밋은 표의 「상태」열에 표시한다.
>
> 결정의 근거는 [decisions.md](decisions.md) · [a11y.md](a11y.md) · [namespaces.md](namespaces.md)에 있다. 여기는 **순서와 검증**만 다룬다.

## 초판에서 무엇이 바뀌었나 — 먼저 밝힌다

초판(2026-08-21 오전)을 실행 전에 감사했더니 **그대로 실행하면 목적을 달성하지 못하는 결함이 셋** 있었다. 지우지 않고 남긴다 — 같은 실수를 다시 하지 않기 위해서다.

| 초판의 결함 | 무엇이 문제였나 | v2의 처리 |
|---|---|---|
| **게이트 정규식이 직전 커밋의 버그 수정을 되돌렸다** | 제안한 `\s*:\s*(?!none\b)`는 `3d518c6`이 `:(?!\s*none\b)`로 고친 백트래킹 오탐의 **원래 형태**였다. 수정 사유가 주석으로만 보호돼 있어 확장할 때 새로 쓰면서 회귀했다 | 정규식을 **버리고** `lightningcss` 파서로 값을 구조로 본다. 픽스처 테스트로 영구 고정 |
| **`drop-shadow` 게이트가 무동작이었다** | `filter: … drop-shadow(` 를 찾자고 했는데 Tailwind 4.3.3은 `filter:`에 `drop-shadow(`를 넣지 않는다(커스텀 속성 `--tw-drop-shadow-size`에 넣는다). 속성 이름으로 추정했다 | 파서가 **커스텀 속성 값**까지 본다 |
| **커밋 순서가 스스로 빌드를 깼다** | 유지 검사 `REQUIRED_RETIREMENTS`(커밋 3)가 폐기 선언(커밋 4)보다 앞서 있었다. 금지 게이트와 유지 검사를 한 커밋에 묶은 탓 | 둘을 분리 — 금지 게이트는 상태 변경 **앞**, 유지 검사는 **뒤** |

그리고 감사 중 **초판이 보지 못한 결함**이 더 나왔다 — 산출 CSS에 아무도 안 쓰는 `.rounded`(토큰 밖 4px)·`.p-5`·`.p-6`이 **주석과 마크다운 표 문구**에서 생성되고 있었고, `ring-*`은 어떤 네임스페이스 폐기로도 막히지 않는다는 것이 컴파일로 확인됐다. 상세는 [namespaces.md](namespaces.md).

## 원칙 — 순서가 곧 안전장치다

이 저장소의 기존 원칙을 그대로 따른다([../README.md](../README.md) 「적용 로드맵」).

> **새 게이트가 위반을 실제로 잡는 것을 증명하기 전에 기존 게이트를 걷어내지 않는다.**

여기에 둘을 더한다. **초판은 하나였고 그게 틀렸다.**

> **금지 게이트는 위반이 존재하는 상태에서 넣는다** — 그래야 주입 시험으로 효과를 증명할 수 있다. 상태 변경 **앞**.
> **유지 검사는 지킬 상태가 생긴 뒤에 넣는다** — 앞에 넣으면 그 사이 빌드가 깨진다. 상태 변경 **뒤**.

그리고 [README.md](README.md) 「갱신 규칙 1」 — **문서를 먼저 고치고 코드를 맞춘다.**

### ⚠️ 매 커밋 공통 — 저장소 루트 `README.md`를 스테이지에 넣지 않는다

워킹트리에 루트 `README.md` 수정본이 있을 수 있다(다른 브랜치 기준으로 로컬 동기화된 것). `frontend` 대상 PR의 path-guard 허용 정규식은 `^(frontend/|docs/|\.github/)`라 **루트 `README.md`가 섞이면 PR이 막힌다.** `git add .` · `git commit -a` 금지 — **모든 커밋은 `frontend/` 아래 명시 경로로만.** 매 커밋 후 V10.

---

## 커밋 순서 (11개)

| # | 내용 | 대상 | 검증 | 상태 |
|---|---|---|---|---|
| **C1** | **ADR 0006 개정 + 승인** — 실측(폐기가 막는 범위 · `drop-shadow` 방출 형태 · `ring` 구멍 · 임의값 설정 부재)을 반영하고 게이트를 파서로 명시 | `docs/adr/0006-*.md` | 문서 | ✅ |
| **C2** | **규범·설계 문서 정정** — 정규식 오인용 삭제 · 줄번호 앵커 → 인용문 앵커 · 목업 실측표를 정적 사본 기준으로 재실측 + 출처 등급 · D5↔D8 충돌 명시 · 되돌림 비용 보강 · Slider 자기모순 · 없는 파일/절 참조 · KWCAG 등급 · 예산 수치 기준 시점 · 이 문서 자체 | `docs/design/*.md` · `docs/mockups/README.md` | 문서 · 앵커 검사 | ✅ |
| **C2b** | **코드 안 서술 정정 7곳 + 규약 2건 + SSOT 이관** — 「유틸리티가 생성되지 않는다」 4곳 · 「첫 두 가지」 · 44px 근거 · iOS 확대 등급 · `ring-*` 전면 금지 · 그림자 4계열 · `DESIGN.md`/`PRODUCT.md` 참조 → `docs/design/` | `shared/ui/README.md` · `theme.css` · `styles.css` · 프리미티브 주석 · `FoundationSection` · `SystemSection` · `check-bundle-budget.mjs` 주석 | V1 | |
| **C2c** | **산문이 유틸리티를 만드는 경로 차단** — 주석·표의 bare `rounded` → 실제 클래스명 · `p-5 p-6` 제거 · `@source not "../../**/*.md"` | `Badge.tsx` · `Button.tsx` · `shared/ui/README.md` · `styles.css` | V1 · **V5** | |
| **C3** | **게이트를 파서로 — 순수 모듈 분리 + `lightningcss` 명시 + 금지 게이트 3종 + 소스측 검사** | `scripts/lib/css-norms.mjs` · `scripts/lib/source-norms.mjs` · `check-bundle-budget.mjs` · `package.json` | V1 · V3 · **V4** | |
| **C4** | **네임스페이스 폐기 + 토큰** — `--radius-*` · 그림자 4계열 폐기, `--radius-lg` · `--color-primary-hover` 추가 | `theme.css` | V1 · V3 | |
| **C5** | **유지 검사 + 예산 기준선 복구** — `REQUIRED_RETIREMENTS` 6종 · `BUDGETS.measured` 실측 갱신 | `check-bundle-budget.mjs` | V1 · **V6** · V9 | |
| **C6** | **게이트 자동 검증** — 체커 픽스처 · 폐기 계약(`compile()`) · 유령 유틸리티 | `scripts/lib/__tests__/*.test.mjs` · vitest 설정 | V1 | |
| **C7** | **프리미티브** — `Card` 라운드 · `Button` 호버 반전 + 3변이 `enabled:` · `color-scheme` + `viewport-fit` · `IconProps` | `Card.tsx` · `Button.tsx` · `styles.css` · `index.html` · `icons.tsx` · `index.ts` | V1 · V7 · V8 | |
| **C8** | **스타일가이드 + 테스트 동시 수정** — `ShapeSection` · D6 닫힘 · D2 열림 · NonGoals 확장 · 단언 2건 | `pages/style-guide/**` · `StyleGuidePage.test.tsx` | V1 · V12 | |
| **C9** | `docs/architecture/` 정정 — `toolchain.md` 부록·§5.3·§4 · `layers.md` 「E」 참조·설정 골격 | `docs/architecture/*.md` | 문서 | |
| **C10** | `frontend/README.md` 재작성 | `README.md` | 문서 | |

**C2b·C2c·C3는 한 묶음이다.** 서술만 고치고 게이트를 안 넣으면 규범이 다시 사람 손에 맡겨지고, 게이트만 넣고 서술을 두면 문서가 계속 틀린 말을 한다.

**C3이 C4보다 앞선다 (금지 게이트).** 폐기 전이라 `shadow-md` 등을 주입하면 실제로 유틸리티가 생성되고, 게이트가 그걸 잡는 것을 **V4로 증명**할 수 있다. 폐기 뒤에는 주입해도 아무것도 안 생겨 게이트 검증이 불가능하다.

**C5가 C4보다 뒤선다 (유지 검사).** `REQUIRED_RETIREMENTS` 6종 중 현재 존재하는 것은 `--color` 하나다. C4 전에 넣으면 빌드가 즉시 깨진다.

**C4를 화면 구현 전에 하는 이유** — 폐기 대상 사용처가 지금 **0건**이다(실측). 화면이 붙은 뒤에는 함께 정리할 코드가 생긴다.

---

## 커밋별 상세

### C2b — 코드 안 서술 정정

교체할 서술. **`FoundationSection`·`SystemSection`은 스타일가이드 화면에 렌더된다.** 위치는 인용문으로 찾는다.

| 위치 | 현재 | 교체 방향 |
|---|---|---|
| `shared/ui/README.md` 코드 규약 3항 | *"위 7색 밖의 색은 유틸리티 자체가 생성되지 않는다"* | *"명명 유틸리티가 없다. 임의값(`bg-[#hex]`)은 테마와 무관하게 컴파일되므로 **빌드 게이트가 막는다**"* |
| `theme.css` 머리 주석 | *"여기 없는 색은 유틸리티도 없다 — 그것이 강제 방식이다"* | 위와 같음 + 게이트 참조 |
| `FoundationSection.tsx` (**화면**) | *"…하드코딩하면 화면에서 바로 드러납니다"* | 임의값 우회로가 있고 빌드가 막는다는 사실로 |
| `SystemSection.tsx` (**화면**) | *"팔레트 밖 색 — 유틸리티 자체가 생성되지 않습니다"* | 위와 같음 |
| `SystemSection.tsx` | *"위 **첫 두 가지**는 `npm run build`가 산출 CSS에서 직접 검사합니다"* | **"전부"** — 다크모드 · 그림자 · 팔레트 밖 색 · 라운드 |
| `shared/ui/README.md` 터치 타겟 행 | *"제품 문서의 접근성 요구"* | *"WCAG AAA 2.5.5 + Apple HIG 44pt + KRDS 44px의 수렴. AA 최저선은 24px(2.5.8)"* ([a11y.md](a11y.md) §1.2) |
| `shared/ui/README.md` 입력 필드 행 | iOS 확대 **단정** | **2차 자료** 등급 표기 ([a11y.md](a11y.md) §2.3) |

함께 추가할 규약(`shared/ui/README.md` 「코드 규약」):
- **`ring-*` 전면 금지** — 폭 유틸리티는 `box-shadow`로, 색 유틸리티는 `--tw-ring-color`로 컴파일된다. **네임스페이스 폐기가 막지 못한다**(컴파일 실측). 링은 `outline-*`
- **그림자는 `box-shadow` 하나가 아니다** — `drop-shadow`는 `--tw-drop-shadow*` 커스텀 속성, `text-shadow`는 자기 속성

**SSOT 이관** — `theme.css` · `shared/ui/README.md` · `styles.css` · `check-bundle-budget.mjs` · 프리미티브 주석(`Badge` `Button` `Card` `ErrorBoundary` `Page` `Progress`)의 `DESIGN.md`/`PRODUCT.md` 참조를 `docs/design/` 참조로. **값이나 판단을 바꾸지 않는다.**

### C2c — 산문이 유틸리티를 만드는 경로 차단

1. **문구** — `Badge.tsx`·`Button.tsx` 주석의 bare `rounded` → `rounded-pill` / `rounded-sm` · `shared/ui/README.md` 표의 *"rounded sm / md / pill"* → `rounded-sm` / `rounded-md` / `rounded-pill` · *"`p-1 p-2 p-4 p-5 p-6`"* → 실제 쓰는 것만
2. **구조** — `styles.css`에 `@source not "../../**/*.md";` (4.3.3이 `not` 지원 — 설치본 확인)
3. **재발 방지** — C3의 라운드 값 게이트가 최종 방어. 문구는 또 늘어난다

검증 **V5** — 산출 CSS에서 `.rounded` · `.p-5` · `.p-6` 소멸.

### C3 — 게이트를 파서로

설계 본문은 [namespaces.md](namespaces.md) 「게이트 — 정규식이 아니라 파서로」 **한 곳**. 여기는 실행 항목만.

```
scripts/lib/css-norms.mjs      ← 순수. (cssText, {palette, radii}) → 위반[]  — lightningcss Declaration visitor
scripts/lib/source-norms.mjs   ← 순수. (fileText, path) → 위반[] (file:line)
scripts/check-bundle-budget.mjs← 오케스트레이터. 예산 + theme.css 읽기 + 위 둘 호출 + 출력
```

- `package.json` `devDependencies`에 `"lightningcss"` 명시 — 이미 설치된 전이 의존(1.33.0)을 **암묵적으로 쓰지 않는다.** `vite`와 같은 `^1.33.0`
- 검사 4종: 그림자·링(값 + `drop-shadow(` 토큰 + `--tw-*` 커스텀 속성) · 팔레트 밖 색 · 라운드 값 · 소스측 임의값/`ring-`
- 출력: 위반마다 **셀렉터 또는 `file:line`** + 값. 검사 범위(「팔레트 7색 + 투명 1 · 라운드 N종 · …」)와 한계를 매 실행 출력
- **⚠️ 우회 플래그를 만들지 않는다.**

### C4 — 네임스페이스 폐기 + 토큰

```css
@theme {
  --color-*: initial;
  /* … 기존 7색 … */
  --color-primary-hover: #77354f;   /* D4 */

  --radius-*: initial;              /* D1 — 기본 8단계 폐기. rounded-full 도 함께 사라진다(실측) */
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: 16px;                /* 신규 — 카드 */
  --radius-pill: 999px;

  --shadow-*: initial;              /* D10 — 이 4줄로 그림자 4계열 전부 미생성(실측). ring-* 은 못 막는다 → 게이트 */
  --drop-shadow-*: initial;
  --inset-shadow-*: initial;
  --text-shadow-*: initial;
}
```

**`--color-line-strong`(#C9C3BC)은 넣지 않는다** — 쓰는 화면(S6)이 아직 없다. D5↔D8 충돌은 의도한 마찰이다.
각 폐기 블록에 **왜 덮어쓰기가 아니라 폐기인지** 주석([namespaces.md](namespaces.md) 참조).

### C5 — 유지 검사 + 기준선

```js
const REQUIRED_RETIREMENTS = ["--color", "--radius", "--shadow", "--drop-shadow", "--inset-shadow", "--text-shadow"];
```
하나라도 사라지면 **빌드 실패.** C4 직후라 지금 통과한다.

`BUDGETS.measured`를 **현재 실측값**으로 갱신 — 지금 `jsGzip` measured 75,223 vs 실측 75,588로 어긋나 있어 *"측정값과 함께 올린다"* 규범이 이미 깨져 있다. `jsChunkGzip`이 `jsGzip`과 동일한 이유(청크 1개)를 주석으로 남기고 유지.

### C6 — 게이트 자동 검증

`scripts/lib/__tests__/` · vitest `// @vitest-environment node`. **원안의 수동 주입 시험 대부분을 이것이 대체한다.**

| 테스트 | 고정하는 것 |
|---|---|
| **T1 체커 픽스처** | 합성 CSS로 양성·음성·경계 — `box-shadow: none`(**공백 있음**) 통과 · `box-shadow: var(--tw-ring-shadow), …` 위반 · `--tw-drop-shadow: drop-shadow(…)` 위반 · `--tw-ring-color: …` 위반 · `text-shadow: none` 통과 · `border-radius: var(--radius-md)` 통과 / `.25rem` 위반 / `calc(infinity * 1px)` 위반 / `0` 통과 · 팔레트 색 통과 / 한 자리 다른 색 위반 / 투명 통과 |
| **T2 폐기 계약** | `tailwindcss` `compile()` + 실제 `theme.css` → `shadow-md` · `drop-shadow-md` · `text-shadow-sm` · `rounded-3xl` · `rounded-full` **미생성** · `ring-2` · `ring-primary` · `bg-[#77354F]` · `rounded-none` **생성**(한계를 고정). Tailwind 업그레이드 시 표가 달라지면 여기서 먼저 깨진다 |
| **T3 유령 유틸리티** | `compile()` 결과에 `p-5` · `p-6` · bare `rounded` 없음 |

> `compile()`은 웹 문서에 없는 준내부 API다. `tailwindcss`가 **정확 핀(`4.3.3`)** 이라 업그레이드가 의도적이고, 깨지면 **테스트가 실패해 드러난다** — 조용히 통과하지 않으므로 채택.

### C7 — 프리미티브

| 대상 | 변경 |
|---|---|
| `Card.tsx` | `rounded-md` → `rounded-lg` (D1) |
| `Button.tsx` | `hover:brightness-110 active:brightness-95` → `enabled:hover:bg-primary-hover enabled:active:bg-primary-hover` (D4). **secondary·ghost의 `hover:`도 `enabled:hover:`로** — disabled 상쇄가 primary에만 있었다. `transition`에서 `filter` 제거 · `disabled:hover:brightness-100` 삭제 · 머리 주석의 「열린 결정」을 D4 참조로 |
| `styles.css` · `index.html` | `@layer base`에 `:root { color-scheme: light }` **평문 CSS** (유틸리티 `scheme-light`는 `index.html`이 스캔 대상이어야 생성돼 조용히 실패할 수 있다) · viewport에 `viewport-fit=cover` |
| `icons.tsx` · `index.ts` | `IconProps`를 `export` + `className?: string` 추가 + `index.ts`에서 타입 재수출. **최소로 연다** — 쓰는 화면이 없다. `aria-hidden` 하드코딩 해제는 의미 전달용 아이콘이 실제로 생길 때 |

**`enabled:`를 쓰는 이유** — 현행은 `hover:brightness-110`을 `disabled:hover:brightness-100`으로 되돌리는 구조다. 배경색으로 바꾸면서 같은 방식을 쓰면 **변이 정렬 순서에 의존**해 취약해진다. `enabled:hover:`는 애초에 적용되지 않게 해 상쇄를 없앤다.

### C8 — 스타일가이드 + 테스트

| 대상 | 변경 |
|---|---|
| 새 `ShapeSection` | D1 — sm/md/lg/pill 4단계 카탈로그 + *"기본 스케일을 폐기했다"* 규범 |
| `FoundationSection.tsx` 상태 색 | D6 — `OpenDecision` → `Rule` |
| `SystemSection.tsx` `NonGoalsSection` | D9 `ring-*` · D10 그림자 4계열 항목 추가 |
| `ComponentsSection.tsx` 버튼 호버 설명 | D4 — *"밝기가 오르고"* → *"배경이 짙어지고"* |
| `ComponentsSection.tsx` 버튼 hint | 터치타겟 근거 표기(AAA · HIG · KRDS) |
| 새 `OpenDecision` | D2 — S5 카드 전면 채움 판단 대기 |

**⚠️ 테스트 2건을 같은 커밋에서 고친다.**
1. `getAllByText("열린 결정").length >= 3` — **하한 단언**이다. D6이 하나 닫고 D2가 하나 열어 **우연히 3이 유지된다.** 그 우연에 기대지 않고 이 파일의 자기 규약(*"셀렉터는 role/label/text만"*)에 맞춰 **내용 단언**으로:
   ```ts
   it("아직 확정되지 않은 결정을 화면에 드러낸다", () => {
     render(<StyleGuidePage />);
     expect(screen.getAllByText("열린 결정").length).toBeGreaterThanOrEqual(1);
     expect(screen.getByText(/지원 브라우저/u)).toBeInTheDocument();   // 여전히 열려 있다
   });
   it("닫은 결정은 규범으로 표시한다", () => {
     render(<StyleGuidePage />);
     expect(screen.getByText(/상태 색/u)).toBeInTheDocument();         // D6 — 닫혔다
   });
   ```
2. `getByText("그림자")`(단수) — NonGoals에 그림자 항목이 하나 더 생기면 *Found multiple elements*로 깨진다. 신규 항목 텍스트를 `"그림자"`와 **정확히 일치하지 않게** 쓰거나 단언을 `getAllByText`로 바꾼다.

`h2 >= 8` 단언은 `ShapeSection` 추가로 여유가 커진다 — 그대로 둔다.

---

## 검증

**자동(C6)이 대부분을 맡는다.** `npm test`가 T1·T2·T3를 매번 돌린다. 빌드 사이클이 필요한 것만 남긴다.

| # | 대상 | 방법 | 기대 |
|---|---|---|---|
| **V1** | 4게이트 | `cd frontend && npm run typecheck && npm run lint && npm test && npm run build` — **파이프 없이** | 통과 |
| **V2** | 규칙 수 회귀 | `npx oxlint --format=json .`의 `number_of_rules` | **297** 유지 |
| **V3** | 오탐 0건 | 주입 없이 빌드 | 팔레트 밖 0 · 그림자 0 · 라운드 위반 0 · `prefers-color-scheme` 0 |
| **V4** | **금지 게이트 실동작** (**C4 이전에만 가능**) | `shadow-md` · `drop-shadow-md` · `ring-primary` · `bg-[#77354F]`를 소스에 주입 → 빌드 | 각각 **exit 1** + 소스 `file:line`. 제거 후 V3 재확인 |
| **V5** | 유령 유틸리티 소멸 | C2c 후 빌드 → `.rounded` · `.p-5` · `.p-6` | 각 **0건** |
| **V6** | 폐기 유지 검사 | `theme.css`에서 `--radius-*: initial` 임시 삭제 → 빌드 | **exit 1** |
| **V7** | 호버 실동작 | `npm run preview -- --host 127.0.0.1` (**`--host` 필수** — 기본은 `[::1]`만 listen) | primary가 **짙어진다** · **3변이 전부** disabled에서 hover 무반응 |
| **V8** | 산출 확인 | `grep -c brightness dist/assets/*.css` · `grep color-scheme …` | `brightness` **0** · `color-scheme:light` **1** |
| **V9** | 예산 기준선 | `BUDGETS.measured` vs 빌드 출력 | 일치 |
| **V10** | **path-guard 모의** (매 커밋 후) | `git -c core.quotePath=false diff --name-only origin/frontend...HEAD \| grep -vE '^(frontend/\|docs/\|\.github/)'` | **0건** |
| **V11** | CLS 재측정 | Slow 4G · 콜드 캐시 (라운드 변경 후) | 경보선 **0.08 미만** 유지 |
| **V12** | 스타일가이드 | preview로 눈 확인 | 4단계 라운드 · 닫힌/열린 결정 표시 |

> ⚠️ **하지 말 것**: `theme.css`에서 색 한 줄을 지우고 그 색이 위반으로 잡히는지 보는 시험. 색을 지우면 그 색을 쓰는 유틸리티도 생성되지 않아 **산출 CSS에서 함께 사라진다.** 시험이 성립하지 않는다. 경계 검증은 T1 픽스처가 한다.

---

## 되돌림 비용

| 변경 | 되돌림 |
|---|---|
| 문서·서술 정정 (C1 · C2 · C2b · C9 · C10) | 커밋 revert |
| 산문 유틸리티 차단 (C2c) | revert 1회. `@source not`만 빼도 원상 복구 |
| **체커 모듈 분리 + `lightningcss` 명시** (C3) | revert 1회. 의존성 한 줄 제거 — 앱 번들 영향 없음 |
| **금지 게이트 + 소스 스캔** (C3) | revert 1회. **단 이후 모든 프론트 PR에 적용된다** |
| **네임스페이스 폐기** (C4) | revert 1회. 화면 구현 전이라 정리할 사용처 **0건** |
| 자동 테스트 (C6) | revert 1회. **되돌리면 정규식 회귀 방지가 사라진다 — 되돌리지 않는 것을 권한다** |
| 프리미티브 (C7) | 각 1회 |
| 스타일가이드 + 테스트 (C8) | 한 커밋에 묶여 함께 되돌아간다 |

---

## 이 계획이 다루지 않는 것

| 항목 | 이유 |
|---|---|
| **AppShell · 라우터 · 6화면 구현** | 라우터 ADR 0005(예약, 미작성)가 선행. 설계는 [layout.md](layout.md)에 계약으로 확정해 두었다. [layout.md](layout.md) §8의 gzip 수치는 bundlephobia 상한이라 **실제 설치·빌드 실측**이 선행한다 |
| **저장소 루트 `README.md`** | `origin/main`이 이미 현재 주제(메리맵) 기준으로 최신. 이 브랜치는 수정한 적이 없어 머지 시 자동 해소. **수정 금지 — 커밋하면 path-guard가 PR을 막는다** |
| **`--color-line-strong`** | 쓰는 화면(S6)이 없다. D5↔D8 충돌은 의도한 마찰 |
| **아이콘 8종 추가** | 쓰는 화면이 없다. 목록만 [inventory.md](inventory.md)에 |
| **`build.target`에 `safari16.4`** | 지원 범위 미결정 |
| **`index.html`의 `<title>` · 파비콘** | 제품명 미확정. `viewport-fit`만 추가 |
| **`staticwebapp.config.json` 캐시 헤더** | 배포 호스트 확정 후. template에 미리 넣는 것은 가능 — C9에서 별도 PR로 지정 |
| **번들 예산 상한 조정** | 코드 스플리팅 적용 후 실측값과 함께 |
| **`frontend/README.md` 외 `.gitattributes` · `staticwebapp.config.template.json`** | **초판이 「이미 알려진 불일치」로 묶었으나 절반은 이미 해소돼 있었다** — `.gitattributes`는 정리됨, template의 CSP·MIME은 축소됨. 남은 건 캐시 헤더 1건. C9에서 `toolchain.md` 부록을 실측으로 갱신한다 |
