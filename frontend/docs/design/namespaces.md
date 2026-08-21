# Tailwind 네임스페이스 폐기 감사

> **최종 갱신** 2026-08-21 · 실측 대상: `tailwindcss@4.3.3` 설치본 `node_modules/tailwindcss/theme.css`
>
> **상태: 감사 결과는 현행 사실. 「조치」 열의 폐기는 아직 적용되지 않았다**([decisions.md](decisions.md) D1 · D10).

## 왜 이 문서가 있나

**「덮어쓰기」와 「폐기」는 다르다.** 이 차이를 놓쳐서 문서 세 곳이 사실과 다른 말을 하고 있었다.

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
| *"라운드 sm / md / pill"* (3단계로 읽힌다) | `src/shared/ui/README.md:28` | 기본 8단계가 살아 있어 **`rounded-2xl`(16px)·`rounded-4xl`(32px)도 생성된다** |
| *"그림자 토큰을 두지 않는다"* | `src/shared/ui/theme.css:74-75` | **기본 그림자 토큰 22개가 살아 있다** |
| *"팔레트 밖 색은 유틸리티 자체가 생성되지 않는다"* | 4곳 (**2곳은 화면 렌더**) | 폐기는 맞으나 **임의값 `bg-[#hex]`는 우회한다** ([decisions.md](decisions.md) D8) |

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
| `--spacing` | 1 | 미폐기 (기본 `0.25rem`) | **유지** | 4px 그리드가 `p-1 p-2 p-4 p-5 p-6`으로 정확히 표현된다 — 토큰을 이중으로 두지 않기로 이미 결정 |
| `--breakpoint-*` | 5 | 미폐기 | **유지** | 정한 값이 없다. 지어내지 않는다 |
| `--container-*` | 13 | 미폐기 | **유지** | 컨테이너 쿼리 단계. 규범 충돌 없음 |
| `--blur-*` `--animate-*` `--ease-*` `--perspective-*` `--tracking-*` `--leading-*` `--aspect-*` `--inset-*` `--default-*` `--max-*` | — | 미폐기 | **유지** | 규범이 금지하는 표현이 아니다 |

**원칙: 폐기는 「규범이 금지한 것」에만 적용한다.** 기본을 쓰기로 이미 결정한 항목까지 폐기하면 이득 없이 유지 비용만 는다.

---

## 게이트 사각지대 — 그림자는 `box-shadow` 하나가 아니다

`scripts/check-bundle-budget.mjs`의 그림자 검사는 정규식 하나다:

```js
pattern: /box-shadow\s*:\s*(?!none\b)[^;}]+/gu
```

| 유틸리티 | 방출 속성 | 게이트 |
|---|---|---|
| `shadow-md` · `shadow-lg` | `box-shadow:` | **잡힌다** |
| `inset-shadow-sm` | `box-shadow:` (inset) | **잡힌다** |
| **`drop-shadow-md`** | `filter: … drop-shadow(…)` | **통과한다** |
| **`text-shadow-sm`** | `text-shadow:` | **통과한다** |
| `ring` · `ring-2` | `box-shadow:` | **잡힌다** (→ [decisions.md](decisions.md) D9) |

`box-shadow:`를 찾는 정규식은 `filter:`나 `text-shadow:`에 매치될 수 없다 — 문자열이 포함되지 않는다.

**조치는 이중이다** — ① `theme.css`에서 네 계열을 폐기해 유틸리티 생성 자체를 막고 ② 게이트 정규식을 3속성으로 넓혀 임의값·인라인 스타일 경로를 잡는다. 어느 하나만으로는 새는 곳이 남는다.

```js
pattern: /(?:box-shadow|text-shadow)\s*:\s*(?!none\b)[^;}]+|filter\s*:[^;}]*drop-shadow\([^;}]*/gu
```

값까지 보는 기존 설계(`none` 제외)는 유지한다 — Preflight의 `:-moz-ui-invalid{box-shadow:none}`은 그림자를 **제거하는** 코드이므로 위반이 아니다.

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

**폐기가 실제로 동작하는지** — 유틸리티를 주입해 산출 CSS에 값이 안 나오는지 본다.

| 주입 | 기대 |
|---|---|
| `rounded-3xl` | 산출 CSS에 `border-radius:1.5rem` **0건** |
| `drop-shadow-md` | 산출 CSS에 `drop-shadow(` **0건** |
| `text-shadow-sm` | 산출 CSS에 `text-shadow:` **0건** |
| `shadow-md` | 폐기 전이면 게이트가 **exit 1** / 폐기 후면 미생성 |

**주입 시험은 제거 후 0건 대조까지 한 세트다.**

---

## 이 문서를 갱신해야 하는 때

1. **Tailwind 메이저·마이너 업그레이드** — 기본 theme의 네임스페이스가 늘거나 바뀐다. 위 실측 명령을 다시 돌린다
2. **새 규범이 특정 표현을 금지할 때** — 그 표현이 어느 네임스페이스에서 오는지 확인하고, 금지라면 폐기 목록에 넣는다
3. **`theme.css`에 `-*: initial`을 추가·삭제할 때** — `REQUIRED_RETIREMENTS`도 함께 고친다
