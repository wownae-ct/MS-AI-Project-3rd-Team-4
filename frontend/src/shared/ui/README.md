# shared/ui — 공용 UI

디자인 시스템의 구현체다. 화면 조립은 `pages/`가 담당한다.

> **값의 SSOT 는 여기가 아니다.** 규범과 근거는 [`docs/design/`](../../../docs/design/README.md)에 있고
> `theme.css` 는 그 값을 Tailwind `@theme` 로 옮긴 구현체다. 톤·색·형태를 바꿀 땐 **[decisions.md](../../../docs/design/decisions.md)를 먼저 고치고 `theme.css` 를 맞춘다.**
> 이 배치의 근거는 [ADR 0006](../../../docs/adr/0006-디자인-규범의-ssot를-프론트엔드-안에-둔다.md). 툴체인 선택은 [ADR 0003](../../../docs/adr/0003-스타일링-엔진으로-tailwind-css-v4를-채택한다.md)·[0004](../../../docs/adr/0004-접근성-프리미티브로-base-ui를-채택한다.md).

## 파일 구성

| 파일 | 역할 |
|---|---|
| `styles.css` | **앱의 유일한 CSS 진입점.** `app/main.tsx` 가 이것 하나만 import 한다. Tailwind · 폰트 · `@source` · base 레이어 |
| `theme.css` | `@theme` 디자인 토큰 — `docs/design/` 의 값 1:1 |
| `Page` `Card` `Button` `Badge` `Money` `Progress` `Tabs` `ErrorBoundary` `icons` | 프리미티브 |
| `NumberInput` `DateField` | 네이티브 입력 대체 — 각각 `type="number"` · `type="date"` 를 갈아끼웠다(그 파일 머리말에 **무엇을 잃고 어떻게 갚았는지** 표로 있다). `DateField` 의 그리드(`DateCalendar`)는 `React.lazy` 로 내린 별도 청크라 `index.ts` 로 내보내지 않는다 |
| `Select` | 네이티브 `<select>` 대체(D22) — 위 둘과 같은 계열이고, 그 파일 머리말에 **무엇을 잃고 어떻게 갚았는지** 표로 있다(잃는 것은 모바일 OS 피커 하나다). 목록까지 직접 그리는 이유는 **열린 목록을 브라우저·OS 가 그려 닫힌 상자와 이질적이었기 때문**이다(사용자 리포트). APG 「Select-Only Combobox」. `field` 16px / `compact` 14px, 드롭다운 11곳이 쓰던 클래스 문자열 5종의 단일 소유자다 |
| `index.ts` | 공개 API. 슬라이스 밖에서는 이 파일로만 접근한다 |

CSS 는 사이드이펙트라 `index.ts` 로 재수출할 수 없다 — 그래서 `main.tsx` 가 경로로 직접 import 한다([layers.md §4.2](../../../docs/architecture/layers.md)).

## 토큰 매핑 — Tailwind 기본과 다른 지점

| 토큰 (`docs/design/`) | 값 | 유틸리티 | 비고 |
|---|---|---|---|
| primary | `#8B3F63` | `text-primary` `bg-primary` `border-primary` | 베리 플럼 |
| primary-soft | `#F1DEE7` | `bg-primary-soft` | 배지 배경 |
| primary-hover | `#77354F` | `enabled:hover:bg-primary-hover` | primary 버튼 hover/active **만** (D4) |
| ink / ink-soft | `#1D1B19` / `#726B65` | `text-ink` `text-ink-soft` | 본문 / 보조 |
| bg / surface / line | `#F7F6F4` / `#FFFFFF` / `#E7E3DE` | `bg-surface` `border-line` | `bg` 는 base 레이어가 `body` 에 1회 적용 |
| 라운드 sm / md / lg / pill | `8` / `10` / `16` / `999px` | `rounded-sm` `rounded-md` `rounded-lg` `rounded-pill` | **4단계가 전부다** — `--radius-*: initial` 로 Tailwind 기본 8단계를 폐기했다(D1). `rounded-2xl` 류는 생성되지 않는다. ⚠️ `rounded-full`(∞px)·`rounded-none`(0)은 폐기와 무관하게 살아남는다 — `full` 은 게이트가 잡고, 원형은 `rounded-pill` 로. 이 저장소에서 `rounded-md` 는 10px, `rounded-lg` 는 16px(카드) |
| spacing xs~xl | `4/8/16/20/24px` | Tailwind 기본 `--spacing`(4px) 배수 | 정확히 표현된다 → **별도 토큰을 만들지 않았다**. ⚠️ 이 칸에 유틸리티명을 나열하지 않는다 — 스캐너가 읽어 유틸리티를 만든다(아래 「산문이 유틸리티를 만든다」) |
| 터치 타겟 44px | — | `min-h-tap` `min-w-tap` | **WCAG AAA 2.5.5 + Apple HIG 44pt + KRDS 터치 44px 의 수렴.** WCAG **AA** 최저선은 24px(2.5.8). 근거 등급은 [a11y.md](../../../docs/design/a11y.md) §1. ⚠️ **44px 는 두 변 모두다** — 라벨 없는 아이콘 버튼은 높이만 잡으면 가로가 글리프 폭까지 줄어든다(AI 답변 평가 버튼이 실제로 28px 였다, D18) |
| 밀도 낮춘 버튼 (시각 36px / 터치 44px) | — | `Button` 의 `size="sm"` | **44px 계약의 예외가 아니라 구현이다** — 상자를 36px 로 그리고 `::after` 가 위아래 4px 씩 넘쳐 히트 영역을 44px 로 되돌린다. 세로 공간이 곧 콘텐츠 면적인 화면용(AI상담 — `Page fill` 이라 컨트롤이 낮아진 만큼 대화창이 커진다). ⚠️ **짝이다**: `h-9` 만 남고 `after:*` 가 빠지면 타겟이 **조용히** 36px 이 된다(화면상 변화가 없어 눈으로 못 잡는다) — `Button.test.tsx` 가 고정한다. 폼 컨트롤은 같은 수법을 못 쓴다(`<input>` 에 의사요소가 없다) → `<label min-h-tap>` 안에 `h-9` 입력을 넣는다(`entities/chat/ui/ChatPanel.tsx`) |
| 주 본문 (읽는 글) | — | `text-base`(16px) + `text-ink` | **원 디자인 문서의 공백을 메운 단계.** KRDS "본문 최소 16px" 권고와 일치 |
| 보조 문구 | `~0.86rem` | `text-sm`(14px) + `text-ink-soft` | 원 디자인 문서의 Body("설명 텍스트, 보조 문구")가 이 자리다 |
| 캡션·라벨 | — | `text-xs`(12px) + `text-ink-soft` | 짧은 것만 |
| 헤드라인 | `~1.2–1.3rem` | `text-xl`(1.25rem) | 행간 1.4 |
| **입력 필드** | — | **16px 미만 금지** | 근거: KRDS 16px + iOS Safari 자동 확대(**2차 자료** — Apple 1차 문서 미확인, [a11y.md](../../../docs/design/a11y.md) §2.3).<br>⚠️ 대상은 **텍스트 입력**이다. 드롭다운(`Select`)의 트리거는 `<button>` 이라 iOS 확대 조건 밖이고 이 계약의 적용 대상이 아니다(D22) — 콘텐츠 안에 홀로 놓이면 14px 를 쓴다 |

## 지켜야 할 규범

규범의 원문과 근거는 [`docs/design/README.md`](../../../docs/design/README.md) 「현행 규범 요약」. 여기는 코드에서 지켜야 할 형태로 옮긴 것이다.

1. **The One Accent Rule** — 베리 플럼은 배지 · 주요 버튼 · 강조 텍스트 · 진행률 채움에만. **배경 워시로 쓰지 않는다.**
   - 예외는 **분류 색** 셋이다 — 업체 사례 `success`(D12) · 결제 유형 `payment-*`(D13→D17) · 웨딩 카테고리 `category-*`(D17). 셋 다 배지 하나씩에만 쓰고, 새 화면에 색이 필요하면 그 화면을 지목한 별도 결정을 먼저 쓴다. 카테고리 코드→클래스 매핑은 `category-badge.ts` 가 단일 출처다(호출부가 `entities/payment` 와 `pages/report` 양쪽이라 entity 에 둘 수 없다).
2. **The Flat-By-Default Rule** — 그림자를 쓰지 않는다. 표면 구분은 1px 헤어라인 보더(`border-line`)로만. 호버도 그림자가 아니라 보더/배경의 옅은 변화로. **그림자는 `box-shadow` 하나가 아니다** — `shadow-*` · `inset-shadow-*` 는 `box-shadow`, `drop-shadow-*` 는 `--tw-drop-shadow*` 커스텀 속성 + `filter`, `text-shadow-*` 는 `text-shadow` 로 나간다. 네 계열 전부 금지 ([D10](../../../docs/design/decisions.md#d10-그림자-네임스페이스를-폐기하고-게이트를-파서로-다시-만든다)).
3. **팔레트 밖 색 금지** — `theme.css` 가 `--color-*: initial` 로 Tailwind 기본 팔레트를 폐기해 **명명 유틸리티**(`bg-red-500` 류)는 없다. 그러나 **임의값(`bg-[#77354F]`)은 테마와 무관하게 그대로 컴파일된다** — Tailwind 에 이를 끄는 설정이 없다. 그래서 **빌드 게이트가 산출 CSS 의 색을 `theme.css` 화이트리스트와 대조해 막는다** ([D8](../../../docs/design/decisions.md#d8-팔레트-밖-색-서술을-사실에-맞게-고치고-게이트로-강제한다)).
4. **semantic color(성공/경고/위험)를 지어내지 않는다** — 도입하지 않기로 닫았다 ([D6](../../../docs/design/decisions.md#d6-상태-색을-도입하지-않는다)). 상태는 보더 · 배경 톤 · 텍스트 · 형태로 표현한다.
5. **`ring-*` 금지 — 링은 `outline-*` 로** — `ring-2` 류는 `box-shadow` 로, `ring-primary` 류는 `--tw-ring-color` 커스텀 속성으로 컴파일된다. **어떤 네임스페이스 폐기로도 막히지 않는다**(컴파일 실측). 게이트가 둘 다 잡는다. `outline-2 outline-offset-2 outline-primary` 를 쓴다 ([D9](../../../docs/design/decisions.md#d9-ring--를-금지어로-둔다)).
6. **금액은 `Money`로만** — KRW 정수 · 콤마 · `tabular-nums` · 700. 화면마다 `toLocaleString` 을 직접 부르면 표기가 조용히 갈린다.
7. **아이콘은 인라인 SVG** — 외부 아이콘 CDN 금지(self-hosting 원칙). 20개를 넘으면 라이브러리 도입을 재검토한다(현재 14종). **화면에 나가는 이모지·문자 글리프를 쓰지 않는다** — 폰트 글리프라 색 게이트의 사각지대이고, 코드포인트가 Wanted Sans 의 어느 `unicode-range` 조각에도 없어 OS 폰트로 폴백해 플랫폼마다 모양·폭·색이 달라진다 ([D18](../../../docs/design/decisions.md#d18-화면에-렌더되는-이모지문자-글리프를-자체-아이콘으로-대체한다)). 주석 안의 이모지는 화면에 나가지 않으므로 무관하다.
8. **폰트는 self-host** — Wanted Sans Variable(OFL-1.1). 원 디자인 문서가 Pretendard 를 명시적으로 기각했다.
9. **다크모드 없음** — 라이트 전용. 게이트가 `prefers-color-scheme` 을 막는다.

### 폰트 — variable/split 을 쓰는 이유

패키지가 4가지 변종을 제공한다. `variable/split`(92 파일, raw 2,281,860 B)을 골랐다.

| 변종 | 파일 | raw | 판정 |
|---|---|---|---|
| **variable / split** | 92 | 2,281,860 B | ✅ `unicode-range` 로 **쓰인 글자 조각만** 전송. 스타일가이드 1화면 실측 **18개** |
| variable / complete | 1 | 1,289,292 B | 한 글자만 써도 1.29 MB 전량 |
| static / split | 644 | 8,771,656 B | 가변축으로 위계를 만드는 디자인 문서 방침과 어긋남 |
| static / complete | 7 | 4,675,776 B | 위와 같음 |

**`preload` 를 쓰지 않는다.** `unicode-range` 분할에서는 브라우저가 페이지 내용을 보고 조각을 고른다 — 어떤 조각이 필요한지 **정적으로 알 수 없으므로** preload 대상을 지정할 수 없다. 찍어서 걸면 안 쓰는 조각을 강제로 받게 만들어 오히려 손해다.

**`font-display: swap` 은 패키지 CSS 기본값이며 그대로 둔다.** LCP 에 유리하고 CLS 에 불리한 교환인데, **실측으로 이 교환이 유리한 쪽임이 확인됐다.**

`Slow 4G` + 콜드 캐시에서 폴백이 1.17 초 표시된 뒤 3파에 걸쳐 교체됐는데도 **CLS 0.01**(경보선 0.08 의 1/8), **LCP 1.29 s** 였다. ⚠️ **이 측정은 라우터 도입(2026-08-22) 이전**이고 스타일가이드 1화면 기준이다 — 초기 JS 가 그 뒤로 늘었으므로 LCP 는 낙관적인 값이다(재측정은 ADR 0005 R7). `theme.css` 가 `--text-*--line-height` 를 명시해 둔 덕에 폰트 교체가 줄 높이를 바꾸지 못하기 때문이다.

→ **`@font-face` 메트릭 오버라이드(`size-adjust` 등)를 넣지 않는다.** 계산해 둔 값과 전체 근거는 `docs/architecture/toolchain.md` §8.2. **서체·폴백·레이아웃이 바뀌면 다시 잰다** — 위 값은 스타일가이드 1화면 기준이다.

## 코드 규약

**런타임 조립 클래스명 금지.** Tailwind 는 소스를 평문 스캔한다 — 공식 문서 원문: *"doesn't attempt to actually parse your files as code in any way."*

```tsx
// ✗ 유틸리티가 생성되지 않는다. 빌드는 성공하고 화면만 무스타일이 된다.
const cls = `btn--${variant}`;

// ✓ 전체 클래스 문자열이 소스에 그대로 존재한다.
const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-primary text-surface",
  secondary: "border-line bg-surface text-ink",
};
```

불가피하면 `@source inline(...)` 으로 세이프리스트하고 **왜 필요한지 주석을 남긴다.**

**산문이 유틸리티를 만든다 — 반대 방향 함정.** 같은 평문 스캔 때문에 **주석·마크다운 표 안의 단어도 유틸리티가 된다.** 실제로 이 파일의 토큰 표가 `p-5 p-6` 을 나열해 아무도 안 쓰는 `.p-5{…}` `.p-6{…}` 가 산출 CSS 에 들어갔고, 주석의 bare `rounded` 가 **토큰 밖 4px** `.rounded{border-radius:.25rem}` 을 만들었다. 조치: `styles.css` 가 `@source not` 으로 `.md` 를 제외하고, 라운드 값 게이트가 토큰 밖 `border-radius` 를 잡는다. **그래도 주석·문서에 클래스명을 나열할 때는 그것이 생성된다는 걸 안다** — 실제로 쓰는 클래스명만 적는다 ([namespaces.md](../../../docs/design/namespaces.md) 「산문이 유틸리티를 만든다」).

**compound vs props** — 슬롯이 3개 이상이면 compound(`Tabs.Root/List/Tab/Panel`), 아니면 props(`Button variant`). Base UI 가 이미 compound인데 래퍼가 props 로 접으면 조합 가능성이 사라진다.

**컨트롤 보더** — 경계가 **유일한** 식별 수단인 컨트롤(빈 입력 필드, 라디오 외곽선)은 `border-ink-soft`(5.24:1)를 쓴다. `line`(1.28:1)은 WCAG 1.4.11 의 3:1 을 못 맞춘다. 반대로 텍스트가 있는 카드·버튼의 헤어라인 보더는 같은 기준이 **명시적으로 면제**한다.

## 게이트

`npm run build` 끝의 [`scripts/check-bundle-budget.mjs`](../../../scripts/check-bundle-budget.mjs) 가 번들 예산과 함께 규범을 **산출 CSS 와 소스 양쪽에서** 검사한다. 검사 본체는 순수 모듈 [`scripts/lib/css-norms.mjs`](../../../scripts/lib/css-norms.mjs)(`lightningcss` 파서)와 [`scripts/lib/source-norms.mjs`](../../../scripts/lib/source-norms.mjs)(`file:line`)이고, 설계는 [namespaces.md](../../../docs/design/namespaces.md) 「게이트 — 정규식이 아니라 파서로」.

| 잡는 것 | 어디서 | 규범 |
|---|---|---|
| `box-shadow`·`text-shadow` 값이 `none` 이 아닌 것 · 어떤 값에든 `drop-shadow(` · `--tw-shadow*`·`--tw-ring*`·`--tw-drop-shadow*`·`--tw-text-shadow*` 가 초기값 이외 | 산출 CSS | 2 · 5 |
| `theme.css` 팔레트 밖 색 (투명 제외) | 산출 CSS | 3 |
| `border-radius` 가 `--radius-*` 토큰·`0` 이외 | 산출 CSS | 형태 |
| `prefers-color-scheme` | 산출 CSS | 9 |
| `theme.css` 의 필수 `-*: initial` 6종 누락 | `theme.css` | 폐기 유지 |
| 색 임의값(`bg-[#…]` 류) · `ring-*` · 그림자 유틸리티 토큰 | 소스 `src/**/*.{ts,tsx}` (주석 포함 — 스캐너가 주석도 읽는다) | 3 · 5 · 2 |
| **bare 유령 유틸리티** — 소스의 단어 하나가 실제 유틸리티가 되는 것(식별자 포함). 컴파일되는 bare 후보 전체를 화이트리스트로 고정한다 | `npm test` (`ghost-candidates.test.mjs`) | 「산문이 유틸리티를 만든다」 |
| **배포 설정** — `dist/staticwebapp.config.json` 의 SPA 폴백 · 자산 immutable 캐시 · HTML `no-cache` · CSP 인라인 style 허용 | 빌드 산출물 (`lib/deploy-config.mjs`) | 라우터 딥링크 계약 |

**주입 시험으로 실제로 잡히는 것을 확인했다** — 폐기 전 `shadow-md` · `drop-shadow-md` · `ring-primary` · `bg-[#77354F]` 주입 → 전부 exit 1 + 셀렉터·`file:line:col` 출력 · 제거 후 통과. `--radius-*: initial` 삭제 → exit 1. 팔레트 색의 **알파 변형**(`bg-surface/12` → `#ffffff1f`)도 막히며, 그 경우 진단이 사유와 [D7](../../../docs/design/decisions.md#d7-반투명은-토큰-없이-opacity-modifier로-쓴다) 참조를 덧붙인다. 픽스처 **43건**이 `npm test` 에서 상시 돈다.

**알려진 한계** (매 실행 출력) — `dist/assets/` 비재귀 · `dist/index.html` 인라인 `<style>` 미검사 · 팔레트 색을 임의값으로 하드코딩(`bg-[#8b3f63]`)하면 산출 CSS 검사는 통과한다(같은 색이라 무해하지만 토큰 우회 — 소스 검사가 잡는다). **우회 플래그는 없다.** 새 색·새 라운드는 [decisions.md](../../../docs/design/decisions.md) → `theme.css` 순서로 넣으면 화이트리스트가 자동으로 따라온다.
