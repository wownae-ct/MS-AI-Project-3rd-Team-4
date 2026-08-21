# 구현 계획

> **최종 갱신** 2026-08-21 · **상태: 미착수.** 이 문서는 구현 지시가 왔을 때 그대로 실행할 수 있도록 준비해 둔 것이다.
>
> 결정의 근거는 [decisions.md](decisions.md) · [a11y.md](a11y.md) · [namespaces.md](namespaces.md)에 있다. 여기는 **순서와 검증**만 다룬다.

## 원칙 — 순서가 곧 안전장치다

이 저장소의 기존 원칙을 그대로 따른다([../README.md](../README.md) 「적용 로드맵」).

> **새 게이트가 위반을 실제로 잡는 것을 증명하기 전에 기존 게이트를 걷어내지 않는다.**

여기에 하나를 더한다.

> **게이트를 먼저 넣고, 그다음 그 게이트가 지킬 상태를 만든다.** 순서가 반대면 게이트의 효과를 주입 시험으로 증명할 수 없다.

그래서 **커밋 3(게이트)이 커밋 4(폐기)보다 앞선다.**

---

## 커밋 순서

| # | 내용 | 대상 | 검증 |
|---|---|---|---|
| **1** | **사실 오류 정정 4곳 + 규약 추가** — 「팔레트 밖 색은 유틸리티가 안 생긴다」 서술 교체(D8) · `ring-*` 금지(D9) · 그림자 4계열 서술(D10) | `src/shared/ui/README.md` · `theme.css`(주석) · `FoundationSection.tsx` · `SystemSection.tsx` | V1 |
| **2** | **문서 SSOT 이관** — `src/` 주석과 `check-bundle-budget.mjs`의 규범 출처를 `frontend/docs/design/`으로 | `theme.css` · `shared/ui/README.md` · `check-bundle-budget.mjs` · 프리미티브 주석 | V1 |
| **3** | **게이트 3종 + `CSS_NORMS` 리팩토링** — 그림자 3속성 확장 · 색 화이트리스트 · 폐기 유지 검사 | `scripts/check-bundle-budget.mjs` | V1 · V3~V7 · V11 |
| **4** | **네임스페이스 폐기 + 토큰** — `--radius-*` · 그림자 4계열 폐기, `--radius-lg` · `--color-primary-hover` 추가 | `src/shared/ui/theme.css` | V1 · V8~V10 · V12 |
| **5** | **`Card` 라운드 전환** (D1) | `src/shared/ui/Card.tsx` | V1 · V16 |
| **6** | **`Button` 호버 반전** (D4) | `src/shared/ui/Button.tsx` | V1 · V13 · V14 |
| **7** | **`color-scheme` + `viewport-fit`** | `src/shared/ui/styles.css` · `index.html` | V1 · V15 |
| **8** | **`IconProps` 확장** | `src/shared/ui/icons.tsx` | V1 · V2 |
| **9** | **스타일가이드 반영 + 테스트 동시 수정** | `pages/style-guide/**` · `StyleGuidePage.test.tsx` | V1 · V17 |
| **10** | **목업 6개 커밋** (현재 untracked) | `frontend/docs/mockups/*.html` | V1 |

**커밋 1과 3은 한 쌍이다.** 서술만 고치고 게이트를 안 넣으면 규범이 다시 사람 손에 맡겨지고, 게이트만 넣고 서술을 두면 문서가 계속 틀린 말을 한다.

**커밋 4를 화면 구현 전에 하는 이유** — 폐기 대상 단계(`rounded-lg`·`rounded-2xl`·`shadow-*` 등) 사용처가 지금 **0건**이다(실측). 화면이 붙은 뒤에는 함께 정리해야 할 코드가 생긴다.

---

## 커밋별 상세

### 커밋 1 — 사실 오류 정정

교체할 서술 4곳. **뒤 두 곳은 스타일가이드 화면에 렌더된다.**

| 위치 | 현재 | 교체 방향 |
|---|---|---|
| `src/shared/ui/README.md:41` | *"위 7색 밖의 색은 유틸리티 자체가 생성되지 않는다"* | *"명명 유틸리티가 없다. 임의값(`bg-[#hex]`)은 테마와 무관하게 컴파일되므로 **빌드 게이트가 막는다**"* |
| `src/shared/ui/theme.css:12` | *"여기 없는 색은 유틸리티도 없다 — 그것이 강제 방식이다"* | 위와 같음 + 게이트 참조 |
| `FoundationSection.tsx:41-43` (**화면**) | *"…하드코딩하면 화면에서 바로 드러납니다"* | 임의값 우회로가 있고 빌드가 막는다는 사실로 |
| `SystemSection.tsx:85` (**화면**) | *"팔레트 밖 색 — 유틸리티 자체가 생성되지 않습니다"* | 위와 같음 |

`SystemSection.tsx:90-92`의 *"위 **첫 두 가지**는 `npm run build` 가 산출 CSS 에서 직접 검사합니다"* → 게이트 확장 후 **"첫 두 가지 + 팔레트 밖 색"**.

함께 추가할 규약(`src/shared/ui/README.md` 「코드 규약」):
- **`ring-*` 금지** — `box-shadow`로 컴파일돼 빌드가 죽는다. 링은 `outline-*`
- **그림자는 `box-shadow` 하나가 아니다** — `drop-shadow`는 `filter`, `text-shadow`는 자기 속성

### 커밋 2 — SSOT 이관

**규범 내용은 그대로 두고 출처 표기만 바꾼다.** 주석이 규범을 인용할 때 앞에 붙던 외부 문서명을 떼고 `docs/design/` 참조로 바꾼다 — 예: `「The Flat-By-Default Rule」 (docs/design/decisions.md)`.

값이나 판단을 바꾸지 않는다. 이 커밋은 **출처 이관**이지 규범 변경이 아니다.

대상: `theme.css` · `shared/ui/README.md` · `scripts/check-bundle-budget.mjs` · 프리미티브 주석(`Badge` `Button` `Card` `ErrorBoundary` `Page` `Progress`) · `styles.css`.

### 커밋 3 — 게이트 3종

**리팩토링 먼저** — 현재 `CSS_NORMS`는 `{ label, pattern, hint }` 고정이라 화이트리스트·복수 패턴이 안 들어간다. `pattern` **또는** `check(text, ctx)` 중 하나를 받도록 넓힌다. 기존 두 규범(그림자·다크모드)의 동작은 유지한다.

**① 그림자 — 3속성으로 확장**
```js
pattern: /(?:box-shadow|text-shadow)\s*:\s*(?!none\b)[^;}]+|filter\s*:[^;}]*drop-shadow\([^;}]*/gu
```
값까지 보는 기존 설계(`none` 제외)를 유지한다 — Preflight의 `:-moz-ui-invalid{box-shadow:none}`은 그림자를 **제거하는** 코드다.

**② 팔레트 밖 색**
```js
const THEME_PATH = resolve(import.meta.dirname, "..", "src", "shared", "ui", "theme.css");

function normalizeHex(raw) {                       // #abc → #aabbcc · 불투명 8자리 → 6자리
  let hex = raw.slice(1).toLowerCase();
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
  if (hex.length === 8 && hex.endsWith("ff")) hex = hex.slice(0, 6);
  return `#${hex}`;
}

function readTheme() {
  // 주석을 먼저 걷어낸다 — 주석 안의 예시 hex 가 화이트리스트에 섞이면 게이트가 조용히 약해진다.
  const text = readFileSync(THEME_PATH, "utf8").replaceAll(/\/\*[\s\S]*?\*\//gu, "");
  const palette = new Set();
  for (const [, hex] of text.matchAll(/--color-[\w-]+\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/gu)) {
    palette.add(normalizeHex(hex));
  }
  if (palette.size === 0) {
    throw new Error(`theme.css 에서 --color-* 를 하나도 읽지 못했다 — 경로나 형식이 바뀌었다: ${THEME_PATH}`);
  }
  palette.add(normalizeHex("#0000"));              // Preflight 의 완전 투명. 색 지정이 아니다.
  const retired = new Set([...text.matchAll(/(--[a-z-]+)-\*\s*:\s*initial/gu)].map((m) => m[1]));
  return { palette, retired };
}

// 3·4·6·8 자리만. 뒤에 hex 문자가 더 붙으면 매치하지 않는다.
const HEX_PATTERN = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/gu;
```

- **화이트리스트를 `theme.css`에서 읽는 이유** — 목록을 스크립트에 손으로 두면 토큰과 조용히 어긋난다. 이 저장소가 별칭·Node 버전에서 거부해 온 이중 출처 패턴이다
- **hex만 보는 이유** — 산출 CSS의 named color(`inherit` 18 · `transparent` 4 · `red` 3 · `white` 2 · `currentcolor` 1)와 함수형 표기(`rgb(from red r g b)` · `color-mix(in lab, red, red)`)는 전부 **Preflight 기능 탐지 프로브**다. hex만 보면 **오탐 0**
- **위반 출력에 주변 문맥 60자를 함께 낸다** — 오탐 시 진단 가능성이 곧 안전장치다

**③ 폐기 유지 검사 (재발 방지)**
```js
const REQUIRED_RETIREMENTS = ["--color", "--radius", "--shadow", "--drop-shadow", "--inset-shadow", "--text-shadow"];
```
`theme.css`에서 폐기 선언이 하나라도 사라지면 **빌드 실패**. 누가 무심코 지우면 그 순간 잡힌다.

**검사 범위와 한계를 매 실행 출력한다** (「조용한 실패 방치 금지」)
```js
console.log(`  검사  팔레트 ${palette.size}색(hex 한정) · 폐기 네임스페이스 ${retired.size}종 · 그림자 3속성`);
```
알려진 한계 2가지도 함께 — ① 함수형 임의값(`bg-[rgb(…)]`) 미검사 ② 팔레트 색의 임의값 하드코딩(`bg-[#8b3f63]`)은 통과.

**⚠️ 우회 플래그를 만들지 않는다.** 새 색이 필요하면 `decisions.md` → `theme.css` 순서로 넣으면 화이트리스트가 자동으로 따라온다.

### 커밋 4 — 네임스페이스 폐기 + 토큰

```css
@theme {
  --color-*: initial;
  /* … 기존 7색 … */
  --color-primary-hover: #77354f;   /* D4 */

  --radius-*: initial;              /* D1 — 기본 8단계 폐기 */
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: 16px;                /* 신규 — 카드 */
  --radius-pill: 999px;

  --shadow-*: initial;              /* D10 */
  --drop-shadow-*: initial;
  --inset-shadow-*: initial;
  --text-shadow-*: initial;
}
```

**`--color-line-strong`(#c9c3bc)는 넣지 않는다** — 쓰는 화면(S6)이 아직 없다.
각 폐기 블록에 **왜 덮어쓰기가 아니라 폐기인지** 주석을 남긴다([namespaces.md](namespaces.md) 참조).

### 커밋 6 — `Button` 호버

```diff
-  primary: "border-transparent bg-primary text-surface hover:brightness-110 active:brightness-95",
+  primary: "border-transparent bg-primary text-surface enabled:hover:bg-primary-hover enabled:active:bg-primary-hover",
```
```diff
-  "transition-[background-color,border-color,filter] duration-150 " +
-  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100";
+  "transition-[background-color,border-color] duration-150 " +
+  "disabled:cursor-not-allowed disabled:opacity-50";
```

**`enabled:`를 쓰는 이유** — 현행은 `hover:brightness-110`을 `disabled:hover:brightness-100`으로 되돌리는 구조다. 배경색으로 바꾸면서 같은 방식을 쓰면 **변이 정렬 순서에 의존**해 취약해진다. `enabled:hover:`는 애초에 적용되지 않게 해 상쇄를 없앤다.

`Button.tsx:10`의 *"hover 상태는 「열린 결정」으로 남겼다"* 주석을 D4 참조로 갱신한다.

### 커밋 9 — 스타일가이드 + 테스트

| 대상 | 변경 |
|---|---|
| 새 `ShapeSection` | D1 — sm/md/lg/pill 4단계 카탈로그 + *"기본 스케일을 폐기했다"* 규범 |
| `FoundationSection.tsx:44-48` | D6 — 상태 색 `OpenDecision` → `Rule` |
| `SystemSection.tsx` `NonGoalsSection` | D9 `ring-*` · D10 그림자 4계열 항목 추가 |
| `ComponentsSection.tsx:51-53` | D4 — *"밝기가 오르고"* → *"배경이 짙어지고"* |
| `ComponentsSection.tsx:26` | 터치타겟 hint에 근거 표기(AAA · HIG · KRDS) |
| 새 `OpenDecision` | D2 — S5 카드 전면 채움 판단 대기 |

**⚠️ 테스트를 같은 커밋에서 고친다.**
`StyleGuidePage.test.tsx:96`이 `getAllByText("열린 결정").length >= 3`을 단언한다. D6이 하나를 닫고 D2가 하나를 열어 **우연히 3이 유지된다.** 그 우연에 기대지 않고, 이 파일의 자기 규약(*"셀렉터는 role/label/text만"*, *"테스트가 리팩터링을 막는 족쇄가 되면 안 된다"*)에 맞춰 **개수 단언을 내용 단언으로 바꾼다**:

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

`h2 >= 8`(`:25`)은 `ShapeSection` 추가로 여유가 커진다 — 그대로 둔다.

---

## 검증

**게이트는 「주입해서 실제로 잡히는 것」까지 확인해야 완료다.** 모든 주입 시험은 **제거 후 0건 대조까지 한 세트**다.

| # | 대상 | 방법 | 기대 |
|---|---|---|---|
| **V1** | 4게이트 | `cd frontend && npm run typecheck && npm run lint && npm test && npm run build` — **파이프 없이** | 통과 |
| **V2** | 규칙 수 회귀 | `npx oxlint --format=json .` 의 `number_of_rules` | **297** 유지 |
| **V3** | 색 게이트 — 양성 | `bg-[#77354F]` 주입 → 빌드 | **exit 1** + 위치·문맥 출력 |
| **V4** | 색 게이트 — 음성 | `bg-[#8b3f63]`(팔레트 색) 주입 → 빌드 | **통과** — 화이트리스트가 실제로 동작 |
| **V5** | 색 게이트 — 경계 | `bg-[#8b3f64]`(한 자리 차이) 주입 → 빌드 | **exit 1** |
| **V6** | 오탐 | 주입 없이 빌드 | 팔레트 밖 **0건** |
| **V7** | 그림자 — box | `shadow-md` 주입 (폐기 전) | **exit 1** |
| **V8** | 그림자 — filter | `drop-shadow-md` 주입 (폐기 후) | 산출 CSS에 `drop-shadow(` **0건** |
| **V9** | 그림자 — text | `text-shadow-sm` 주입 (폐기 후) | 산출 CSS에 `text-shadow:` **0건** |
| **V10** | 라운드 폐기 | `rounded-3xl` 주입 | 산출 CSS에 `border-radius:1.5rem` **0건** |
| **V11** | `ring-*` | `ring-2` 주입 | **exit 1** |
| **V12** | **폐기 유지 검사** | `theme.css`에서 `--radius-*: initial` 임시 삭제 → 빌드 | **exit 1** — 재발 방지가 실제로 동작 |
| **V13** | 호버 실동작 | `npm run preview -- --host 127.0.0.1` (**`--host` 필수** — 기본은 `[::1]`만 listen) | primary가 **짙어진다** · disabled에서 hover 무반응 |
| **V14** | 산출 확인 | `grep brightness dist/assets/*.css` | **0건** |
| **V15** | `color-scheme` | `grep color-scheme dist/assets/*.css` | `light` 1건 |
| **V16** | CLS 재측정 | Slow 4G · 콜드 캐시 | 경보선 **0.08 미만** 유지 (라운드 변경 후) |
| **V17** | 스타일가이드 | `npm run preview` 로 눈으로 확인 | 4단계 라운드 · 닫힌/열린 결정 표시 |

### V3~V5가 한 세트인 이유

색 게이트는 **잡는 것**만으로는 검증이 안 된다. 팔레트 색을 잡아 버리면 오탐이고, 한 자리 다른 색을 놓치면 무용지물이다. **양성 · 음성 · 경계 셋을 함께 돌려야** 화이트리스트가 정확히 동작함이 증명된다.

> ⚠️ **하지 말 것**: `theme.css`에서 색 한 줄을 지우고 그 색이 위반으로 잡히는지 보는 시험. 색을 지우면 그 색을 쓰는 유틸리티도 생성되지 않아 **산출 CSS에서 함께 사라진다.** 아무것도 안 잡히는 것이 정상이라 시험이 성립하지 않는다.

---

## 되돌림 비용

| 변경 | 되돌림 |
|---|---|
| 문서 · 서술 정정 | 커밋 revert |
| 토큰 · `Button` · `icons` | 커밋 revert 1회 |
| **네임스페이스 폐기** | revert 1회. 단 그 사이 폐기 대상 유틸리티를 쓴 코드가 있으면 함께 정리 — **화면 구현 전에 하는 이유** |
| **게이트 3종** | revert 1회. **단 이후 모든 프론트 PR에 적용된다** |
| 스타일가이드 + 테스트 | 한 커밋에 묶여 함께 되돌아간다 |

---

## 이 계획이 다루지 않는 것

| 항목 | 이유 |
|---|---|
| **AppShell · 라우터 · 6화면 구현** | 라우터 ADR이 선행한다. 설계는 [layout.md](layout.md)에 계약으로 확정해 두었다 |
| **`--color-line-strong`** | 쓰는 화면(S6)이 없다 |
| **아이콘 8종 추가** | 쓰는 화면이 없다. 목록만 [inventory.md](inventory.md)에 |
| **`build.target`에 `safari16.4`** | 지원 범위 미결정 |
| **`index.html`의 `<title>` · 파비콘** | 제품명 미확정. `viewport-fit`만 추가 |
| **번들 예산 상한 조정** | 코드 스플리팅 적용 후 실측값과 함께 |
| **`frontend/README.md` · `.gitattributes` · `staticwebapp.config.template.json`** | 이미 알려진 불일치. `../architecture/toolchain.md` 부록이 별도 PR로 지정 |
