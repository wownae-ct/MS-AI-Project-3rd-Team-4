# Tailwind 네임스페이스 폐기 감사

> **최종 갱신** 2026-08-21 · 실측 대상: `tailwindcss@4.3.3` 설치본 `node_modules/tailwindcss/theme.css`
>
> **상태: 「조치」 열의 폐기는 2026-08-21 적용됐다**([decisions.md](decisions.md) D1 · D10). 감사표의 「현재 상태」는 적용 **전** 실측이고, 적용 후 상태는 「조치」 열이다.
>
> **이 문서가 게이트 설계의 정본이다.** [decisions.md](decisions.md) D8·D10은 결정과 근거만 두고 설계는 여기로 링크한다 — 같은 본문을 두 곳에 두면 한쪽이 낡는다(실제로 그랬다).

## 왜 이 문서가 있나

**「덮어쓰기」와 「폐기」는 다르다.** 이 차이를 놓쳐서 아래 세 종류의 서술(위치로는 여섯 곳, 그중 둘은 화면 렌더)이 사실과 다른 말을 하고 있었다.

```css
@theme {
  --color-*: initial;      /* 폐기 — 기본 팔레트 288개가 사라진다 */
  --color-primary: #8b3f63;

  --radius-sm: 8px;        /* 덮어쓰기 — 기본 8단계 중 sm 하나만 바뀐다 */
  --radius-md: 10px;       /*             lg·xl·2xl·3xl·4xl·xs 는 그대로 산다 */
}
```

`theme.css`가 **실제로 폐기한 네임스페이스는 `--color` 하나뿐**이다. 그런데 문서·주석·스타일가이드 화면은 여러 규범이 구조로 강제된다고 말한다.

| 서술 | 위치 | 사실 |
|---|---|---|
| *"라운드 sm / md / pill"* (3단계로 읽힌다) | `src/shared/ui/README.md` 토큰 표 | 기본 8단계가 살아 있어 **`rounded-2xl`(16px)·`rounded-4xl`(32px)도 생성된다** |
| *"그림자 토큰을 두지 않는다"* | `src/shared/ui/theme.css` Shape 블록 끝 주석 | **기본 그림자 토큰 22개가 살아 있다** |
| *"팔레트 밖 색은 유틸리티 자체가 생성되지 않는다"* | 4곳 — `shared/ui/README.md` 코드 규약 · `theme.css` 머리 주석 · `FoundationSection` · `SystemSection` (**뒤 2곳은 화면 렌더**) | 폐기는 맞으나 **임의값 `bg-[#hex]`는 우회한다** ([decisions.md](decisions.md) D8) |

> 위치를 줄 번호가 아니라 **인용문**으로 적는다 — 줄 번호는 편집마다 썩는다. 이 문서군 초판의 `StyleGuidePage.test.tsx:96` 앵커가 실제로는 112행이었다.

**공통 뿌리**: 「의도를 문서에 적고 구조로 강제했다고 믿는 것」. 이 저장소가 `.env`의 `NODE_ENV` · oxlint `plugins` 대체 · 경로 별칭 이중 정의에서 반복해 부딪힌 사고 클래스와 같다.

---

## 감사표 (전수)

| 네임스페이스 | 기본 토큰 | 현재 상태 | 조치 | 사유 |
|---|---|---|---|---|
| `--color-*` | 288 | **폐기됨** + 7색 정의 | 유지 | 이미 되어 있다. 단 임의값 우회로는 별도 장치 필요(D8) |
| `--radius-*` | 8 | 미폐기 · `sm`·`md` 덮어씀 + `pill` 추가 | **폐기 → `sm`·`md`·`lg`·`pill` 4단계** | "4단계"를 문장이 아니라 사실로 만든다 (D1) |
| `--shadow-*` | 8 | 미폐기 | **폐기** | The Flat-By-Default Rule (D10) |
| `--drop-shadow-*` | 6 | 미폐기 | **폐기** | 위와 같음. **게이트 사각지대**(아래) |
| `--inset-shadow-*` | 3 | 미폐기 | **폐기** | 위와 같음 |
| `--text-shadow-*` | 5 | 미폐기 | **폐기** | 위와 같음. **게이트 사각지대**(아래) |
| `--text-*` | 31 | 미폐기 · `--text-*--line-height` 6개만 덮어씀 | **유지** | 크기는 Tailwind 기본을 쓰되 **역할별 용처를 문서로 못 박은 것**이 원래 설계다. 폐기하면 `text-sm` 등이 전부 사라진다 |
| `--font-*` | 12 | 미폐기 · `--font-sans` 덮어씀 | **유지** | `font-serif`가 남지만 서체는 코드가 아니라 규범으로 통제한다. 폐기 시 Preflight의 mono 처리(`--default-mono-font-family`)와 얽힐 여지가 있어 이득 대비 위험이 크다 |
| `--spacing` | 1 | 미폐기 (기본 `0.25rem`) | **유지** | 4px 그리드가 Tailwind 기본 spacing 배수로 정확히 표현된다 — 토큰을 이중으로 두지 않기로 이미 결정 |
| `--breakpoint-*` | 5 | 미폐기 | **유지** | 제품 스펙이 값을 정하지 않았고 [ADR 0003](../adr/0003-스타일링-엔진으로-tailwind-css-v4를-채택한다.md) §3 이 「Tailwind 기본 유지」로 **결정했다** — 따라서 **기본값이 곧 유효값이다.** 실사용 2개: `md` 48rem(**768px**) = 셸 모바일↔데스크톱 전환(`AppShell.tsx`) · `lg` 64rem(**1024px**) = `Page` 기본 폭 3단계(`Page.tsx`). 「정한 값이 없다」로 읽고 새 값을 넣지 말 것 |
| `--container-*` | 13 | 미폐기 | **유지** | 컨테이너 쿼리 단계. 규범 충돌 없음 |
| `--blur-*` `--animate-*` `--ease-*` `--perspective-*` `--tracking-*` `--leading-*` `--aspect-*` `--inset-*` `--default-*` `--max-*` | — | 미폐기 | **유지** | 규범이 금지하는 표현이 아니다 |

**원칙: 폐기는 「규범이 금지한 것」에만 적용한다.** 기본을 쓰기로 이미 결정한 항목까지 폐기하면 이득 없이 유지 비용만 는다.

---

## 폐기가 실제로 막는 범위 — 컴파일로 확인했다

`tailwindcss`의 `compile()`에 **실제 `theme.css`** 와 폐기 선언 5종을 넣고 후보를 컴파일했다(2026-08-21, 4.3.3).

| 후보 | 현행 | 폐기 5종 적용 후 | 뜻 |
|---|---|---|---|
| `rounded-3xl` | 생성 | **없음** | D1 성립 |
| `rounded-full` | 생성 (`calc(infinity * 1px)`) | **생성** | ⚠️ `staticValues`라 폐기와 무관. **게이트가 `∞px`로 잡는다.** 초판은 「사라진다」고 적었으나 폐기 계약 테스트가 반증했다(셀렉터 판독 버그). 원형은 `rounded-pill` |
| `rounded-none` | 생성 (`border-radius: 0`) | 생성 | 무해 — `0`은 토큰 밖 값이 아니라 「없음」이다 |
| `shadow` · `shadow-md` · `drop-shadow-md` · `text-shadow-sm` | 생성 | **없음** | **그림자 4계열은 폐기만으로 전부 막힌다** |
| **`ring` · `ring-2` · `ring-primary` · `inset-ring-2`** | 생성 | **전부 생성** | ⚠️ **폐기와 무관한 네임스페이스.** 게이트가 맡아야 한다 |
| **`bg-[#77354F]`** | 생성 | **생성** | ⚠️ 임의값은 테마를 조회하지 않는다(D8) |

**결론** — 폐기가 1차 방어로 충분한 것은 그림자와 라운드 **단계**다. **게이트가 실제로 메워야 할 구멍은 `ring-*` · 임의값 · `rounded-full` 셋**이고, 그림자 게이트는 폐기가 뚫렸을 때(누가 `initial` 줄을 지웠을 때)의 2차 방어다.

## 게이트 — 정규식이 아니라 파서로

초판은 `scripts/check-bundle-budget.mjs`의 정규식을 `box-shadow:` 하나에서 3속성으로 넓히자고 했다. **그 설계를 버린다.** 이유가 셋이다.

| 문제 | 내용 |
|---|---|
| **무동작** | `drop-shadow-*`는 `filter:`에 `drop-shadow(`를 넣지 않는다. 실측: `--tw-drop-shadow-size: drop-shadow(…)` + `filter: … var(--tw-drop-shadow,)`. *"`filter:` 안에서 `drop-shadow(`를 찾는다"* 는 정규식은 **한 건도 매치하지 못한다** |
| **미탐** | `ring-<color>` · `ring-inset` · `inset-ring-*`는 `box-shadow`를 내지 않고 `--tw-ring-color` 같은 **커스텀 속성만** 낸다. 속성 이름으로는 못 잡는다 |
| **오탐 회귀** | 값을 배제하려고 `\s*:\s*(?!none\b)` 처럼 쓰면 `\s*`가 0글자로 백트래킹해 `box-shadow: none`(공백 있음)을 위반으로 잡는다. 커밋 `3d518c6`이 이걸 `:(?!\s*none\b)`로 고쳤는데, 초판 제안은 **고친 형태를 되돌리는 정규식**이었다 — 수정 사유가 주석으로만 보호돼 있었기 때문이다 |

세 문제는 전부 *「속성 이름 문자열을 찾고, 값은 추정한다」* 는 방식의 한계다. **`lightningcss`의 `Declaration` visitor**로 선언을 파싱해 **속성과 값을 구조로** 본다.

- **새 의존성이 아니다.** `vite`(`^1.33.0`) · `@tailwindcss/node`(`1.32.0`)가 이미 선언한 정식 의존이고 Vite가 CSS를 최소화할 때 쓰는 바로 그 파서다. 단 전이 의존을 암묵적으로 쓰지 않는다 — `package.json` `devDependencies`에 `lightningcss` 를 명시한다
- **체커를 순수 모듈로 분리한다** — `scripts/lib/css-norms.mjs`(산출 CSS 텍스트 → 위반 목록) · `scripts/lib/source-norms.mjs`(소스 텍스트 → 위반 목록, `file:line`). `check-bundle-budget.mjs`는 예산 + 둘을 호출하는 오케스트레이터. **분리 이유는 테스트 가능성이다** — 위 오탐 수정이 픽스처로 고정돼 있었다면 초판 제안이 회귀라는 걸 즉시 알았다

| 검사 | 방식 | 닫는 구멍 |
|---|---|---|
| **그림자 · 링** | ① `box-shadow` · `text-shadow` 선언의 **값**이 `none`이 아닌 것 — 파서가 값을 주므로 백트래킹 오탐이 구조적으로 불가능 ② **어떤 선언의 값에든** `drop-shadow(` 함수 토큰 ③ `--tw-shadow` · `--tw-drop-shadow*` · `--tw-text-shadow*` · `--tw-ring-shadow` · `--tw-inset-ring-shadow` · `--tw-ring-color` · `--tw-inset-ring-color` 가 **초기값 이외**의 값 | 그림자 4계열 2차 방어 · **`ring-*` 4종** |
| **팔레트 밖 색** | 화이트리스트를 `theme.css`에서 읽고(주석 제거 후) 파싱된 **색 값**과 대조. 출력에 「팔레트 8색 + 투명 1」처럼 **투명을 따로 센다** | 임의값 `bg-[#hex]` |
| **라운드 값** | `border-radius` 값이 `--radius-*` + `0` 화이트리스트 안인가. 파서가 `calc(infinity * 1px)`(`{unit:"px", value:null}`)와 `.25rem`(`{unit:"rem", value:0.25}`)을 구분해 준다 | 임의값 `rounded-[12px]` · 수기 CSS · 산문이 만든 `.rounded`(아래) |
| **소스측** | `src/**/*.{ts,tsx}`에서 색 임의값(`bg-[#…]` 등)과 `ring-` 클래스 토큰을 `file:line`과 함께 보고 | 산출 CSS만 보면 `.bg-\[\#77354F\]` 라는 셀렉터밖에 못 알려준다. oxlint에 `no-restricted-syntax`가 없어(공식 규칙 목록 확인) 린트에 둘 수 없다 |

**임의값을 Tailwind 설정으로 끌 수는 없다.** 공식 문서가 그런 설정을 제공하지 않고 `@utility`는 추가만 한다. 게이트가 유일한 수단이다.

**알려진 한계 — 매 실행 출력한다**: `dist/assets/` 비재귀 스캔 · `dist/index.html`의 인라인 `<style>` 미검사 · 팔레트 색의 임의값 하드코딩(`bg-[#8b3f63]`)은 통과.

## 산문이 유틸리티를 만든다 — 스캐너는 주석을 모른다

산출 CSS를 소스 토큰과 전수 대조하니 **어느 컴포넌트도 쓰지 않는 유틸리티**가 있었다.

| 산출 셀렉터 | 유일한 출처 |
|---|---|
| `.p-5` · `.p-6` | `src/shared/ui/README.md` 토큰 표의 *"`p-1 p-2 p-4 p-5 p-6`"* 문구 |
| `.rounded{border-radius:.25rem}` — **토큰 밖 4px** | `Badge.tsx` · `Button.tsx` **주석**의 bare `rounded`, `README.md` 표의 *"rounded sm / md / pill"* |

`styles.css`의 `@source "../../"`가 `src/` 전체(`.md` 포함)를 스캔하고, Tailwind는 *"doesn't attempt to actually parse your files as code"* (공식) — 주석과 산문을 구분하지 않는다. CLAUDE.md가 경고하는 「조립 클래스명이 안 생기는」 함정의 **반대 방향**이다: **안 쓰는 클래스가 생긴다.** 그리고 그중 하나가 D1 「4단계 고정」을 **규범 문서 자신의 문장으로** 위반하고 있었다.

조치는 셋 — ① 문구에서 bare 유틸리티명 제거 ② `@source not "../../**/*.md"` 로 마크다운 제외 ③ 라운드 값 게이트(위)가 최종 방어.

### ⚠️ 위 조치로는 **처음 보는 유령**을 못 잡는다 (2026-08-22 보강)

위 셋은 **이미 당한 이름**에만 듣는다. 실제로 다시 뚫렸다 — 테스트가 RTL 렌더 루트를 `const { container } = render(...)` 로
구조 분해하자 그 **식별자**가 후보가 되어 산출 CSS 에 `.container` 6규칙이 생겼다(선언 378 → 385, CSS +45 B).
규범 위반이 아니라 빌드 게이트가 보지 않고, 이름 목록에도 없어 유령 후보 테스트도 통과했다.

그래서 뒤집었다 — **bare 후보 중 CSS 를 실제로 만드는 것 전체**를 화이트리스트로 고정한다
(`scripts/lib/__tests__/ghost-candidates.test.mjs`). 소스의 bare 후보는 242개지만 컴파일되는 것은 **10개뿐**이라
(`budget`·`honeymoon` 같은 도메인 단어는 유틸리티가 아니다) 유지 비용이 사실상 없다. 새 단어가 하나라도 늘면 실패한다.

10개는 감사해 둘로 나눠 적었다 — 실제로 쓰는 클래스 8종과, **피할 수 없는 식별자 충돌 2종**
(`block` = `Button` 의 prop 이름, 구현은 `w-full` · `static` = `ErrorBoundary` 의 JS 키워드). 각 25 B 남짓이라 받아들였다.

> **판정 프로브의 함정 3건** — 같은 작업에서 `tailwind-probe.mjs` 가 세 번 거짓 보고를 했다. 이스케이프 집합에 `@` 가 없어
> 컨테이너 변이가 전부 「미생성」, 셀렉터 뒤 `:last-child` 때문에 의사 클래스 변이가 「미생성」, 산출 머리말 주석의
> `https://tailwindcss.com` 때문에 bare `com` 이 「생성됨」으로 나왔다. **게이트를 믿기 전에 게이트를 시험한다** — 셋 다 주입 시험으로 잡았다.

---

## 재발 방지 — 폐기 상태를 빌드가 지킨다

폐기했더라도 나중에 누가 지우면 조용히 원상복귀한다. **그 상태를 사람이 기억하게 두지 않는다.**

게이트가 `theme.css`에서 폐기 선언을 읽어, 필수 목록이 하나라도 빠지면 **빌드를 실패시킨다**:

```js
const REQUIRED_RETIREMENTS = ["--color", "--radius", "--shadow", "--drop-shadow", "--inset-shadow", "--text-shadow"];
```

이 장치가 이 문서에서 가장 중요하다. 값이나 서술이 아니라 **상태를 빌드가 지키게** 만든다.

---

## 확인 방법

**폐기 목록 실측** — 이 문서를 갱신할 때는 기억이 아니라 아래로 다시 잰다.

```bash
cd frontend
# Tailwind 기본 theme 의 네임스페이스별 토큰 수
node -e "const s=require('fs').readFileSync('node_modules/tailwindcss/theme.css','utf8');
const n={};for(const[,k]of s.matchAll(/^\s*(--[a-z0-9-]+?)-[^:]*:/gmi))n[k]=(n[k]||0)+1;
console.log(Object.entries(n).sort((a,b)=>b[1]-a[1]))"

# 우리 theme.css 가 폐기한 것
grep -oE '\-\-[a-z-]+\-\*\s*:\s*initial' src/shared/ui/theme.css
```

**폐기가 실제로 동작하는지** — 수동 주입이 아니라 **vitest가 상시 확인한다.** `scripts/lib/__tests__/`의 테스트가 `tailwindcss` `compile()`에 실제 `theme.css`를 넣어 위 「폐기가 실제로 막는 범위」 표를 그대로 단언한다 — 사라져야 할 것이 사라지고, **살아남는 것(`ring-2` · `bg-[#hex]` · `rounded-none`)은 살아남는다고도 단언**해 한계를 고정한다. Tailwind를 올렸을 때 표가 달라지면 테스트가 먼저 알린다.

**게이트가 실제로 잡는지** — 같은 폴더의 픽스처 테스트가 합성 CSS로 양성·음성·경계를 고정한다. 빌드 사이클이 필요한 확인은 하나만 남는다: **폐기 적용 전**에 `shadow-md` · `drop-shadow-md` · `ring-primary` · `bg-[#77354F]`를 소스에 주입해 빌드가 **exit 1** + `file:line`을 내는 것. 폐기 뒤에 하면 유틸리티가 애초에 안 생겨 게이트를 검증할 수 없다.

---

## 이 문서를 갱신해야 하는 때

1. **Tailwind 메이저·마이너 업그레이드** — 기본 theme의 네임스페이스가 늘거나 바뀐다. 위 실측 명령을 다시 돌린다
2. **새 규범이 특정 표현을 금지할 때** — 그 표현이 어느 네임스페이스에서 오는지 확인하고, 금지라면 폐기 목록에 넣는다
3. **`theme.css`에 `-*: initial`을 추가·삭제할 때** — `REQUIRED_RETIREMENTS`도 함께 고친다. 순서는 **폐기 선언 먼저, 유지 검사 나중** — 반대로 하면 그 사이 빌드가 깨진다
4. **Tailwind 업그레이드 후 `npm test`가 폐기 계약 테스트에서 실패할 때** — 위 「폐기가 실제로 막는 범위」 표를 다시 재고, 달라진 곳을 이 문서와 테스트에 함께 반영한다
