# shared/ui — 공용 UI

디자인 시스템의 구현체다. 화면 조립은 `pages/`가 담당한다.

> **값의 SSOT 는 여기가 아니다.** `DESIGN.md`(커밋 `558a463`, `git show 558a463:DESIGN.md`)가 원본이고
> `theme.css` 는 그 값을 Tailwind `@theme` 로 옮긴 구현체다. 톤·색을 바꿀 땐 **DESIGN.md 를 먼저 고친다.**
> 근거와 대안 비교는 [ADR 0003](../../../docs/adr/0003-스타일링-엔진으로-tailwind-css-v4를-채택한다.md)·[0004](../../../docs/adr/0004-접근성-프리미티브로-base-ui를-채택한다.md).

## 파일 구성

| 파일 | 역할 |
|---|---|
| `styles.css` | **앱의 유일한 CSS 진입점.** `app/main.tsx` 가 이것 하나만 import 한다. Tailwind · 폰트 · `@source` · base 레이어 |
| `theme.css` | `@theme` 디자인 토큰 — DESIGN.md 1:1 |
| `Page` `Card` `Button` `Badge` `Money` `Progress` `Tabs` `ErrorBoundary` `icons` | 프리미티브 |
| `index.ts` | 공개 API. 슬라이스 밖에서는 이 파일로만 접근한다 |

CSS 는 사이드이펙트라 `index.ts` 로 재수출할 수 없다 — 그래서 `main.tsx` 가 경로로 직접 import 한다([layers.md §4.2](../../../docs/architecture/layers.md)).

## 토큰 매핑 — Tailwind 기본과 다른 지점

| DESIGN.md | 값 | 유틸리티 | 비고 |
|---|---|---|---|
| primary | `#8B3F63` | `text-primary` `bg-primary` `border-primary` | 베리 플럼 |
| primary-soft | `#F1DEE7` | `bg-primary-soft` | 배지 배경 |
| ink / ink-soft | `#1D1B19` / `#726B65` | `text-ink` `text-ink-soft` | 본문 / 보조 |
| bg / surface / line | `#F7F6F4` / `#FFFFFF` / `#E7E3DE` | `bg-surface` `border-line` | `bg` 는 base 레이어가 `body` 에 1회 적용 |
| rounded sm / md / pill | `8` / `10` / `999px` | `rounded-sm` `rounded-md` `rounded-pill` | ⚠️ **Tailwind 기본(4/6/8px)을 덮어썼다.** 이 저장소에서 `rounded-md` 는 10px 이다 |
| spacing xs~xl | `4/8/16/20/24px` | `p-1 p-2 p-4 p-5 p-6` | Tailwind 기본 스케일로 정확히 표현된다 → **별도 토큰을 만들지 않았다** |
| 터치 타겟 44px | — | `min-h-tap` | 제품 문서의 접근성 요구 |
| 주 본문 (읽는 글) | — | `text-base`(16px) + `text-ink` | **DESIGN.md 공백을 메운 단계.** KRDS "본문 최소 16px" 권고와 일치 |
| 보조 문구 | `~0.86rem` | `text-sm`(14px) + `text-ink-soft` | DESIGN.md 의 Body("설명 텍스트, 보조 문구")가 이 자리다 |
| 캡션·라벨 | — | `text-xs`(12px) + `text-ink-soft` | 짧은 것만 |
| 헤드라인 | `~1.2–1.3rem` | `text-xl`(1.25rem) | 행간 1.4 |
| **입력 필드** | — | **16px 미만 금지** | iOS Safari 는 그보다 작은 입력에 포커스 시 화면을 자동 확대한다 |

## 지켜야 할 규범

1. **The One Accent Rule** — 베리 플럼은 배지 · 주요 버튼 · 강조 텍스트 · 진행률 채움에만. **배경 워시로 쓰지 않는다.**
2. **The Flat-By-Default Rule** — 그림자를 쓰지 않는다. 표면 구분은 1px 헤어라인 보더(`border-line`)로만. 호버도 그림자가 아니라 보더/배경의 옅은 변화로.
3. **팔레트 밖 색 금지** — `theme.css` 가 `--color-*: initial` 로 Tailwind 기본 팔레트를 폐기했다. 위 7색 밖의 색은 유틸리티 자체가 생성되지 않는다.
4. **semantic color(성공/경고/위험)를 지어내지 않는다** — 디자인 문서가 아직 확정하지 않았다.
5. **금액은 `Money`로만** — KRW 정수 · 콤마 · `tabular-nums` · 700. 화면마다 `toLocaleString` 을 직접 부르면 표기가 조용히 갈린다.
6. **아이콘은 인라인 SVG** — 외부 아이콘 CDN 금지(self-hosting 원칙). 20개를 넘으면 라이브러리 도입을 재검토한다.
7. **폰트는 self-host** — Wanted Sans Variable(OFL-1.1). 디자인 문서가 Pretendard 를 명시적으로 기각했다.

### 폰트 — variable/split 을 쓰는 이유

패키지가 4가지 변종을 제공한다. `variable/split`(92 파일, raw 2,281,860 B)을 골랐다.

| 변종 | 파일 | raw | 판정 |
|---|---|---|---|
| **variable / split** | 92 | 2,281,860 B | ✅ `unicode-range` 로 **쓰인 글자 조각만** 전송. 스타일가이드 1화면 실측 **18개** |
| variable / complete | 1 | 1,289,292 B | 한 글자만 써도 1.29 MB 전량 |
| static / split | 644 | 8,771,656 B | 가변축으로 위계를 만드는 디자인 문서 방침과 어긋남 |
| static / complete | 7 | 4,675,776 B | 위와 같음 |

**`preload` 를 쓰지 않는다.** `unicode-range` 분할에서는 브라우저가 페이지 내용을 보고 조각을 고른다 — 어떤 조각이 필요한지 **정적으로 알 수 없으므로** preload 대상을 지정할 수 없다. 찍어서 걸면 안 쓰는 조각을 강제로 받게 만들어 오히려 손해다.

**`font-display: swap` 은 패키지 CSS 기본값이며 그대로 둔다.** LCP 에 유리하고 CLS 에 불리한 교환인데, 이 저장소는 `theme.css` 가 `--text-*--line-height` 를 **명시**해 두어 폰트 교체가 줄 높이를 바꾸지 못한다. 남는 위험은 자간 차이로 줄 수가 바뀌는 경우뿐이다. 실제로 문제가 되는지는 **저속 네트워크에서만** 드러난다 — 로컬 preview 는 폰트가 블록 구간 안에 도착해 스왑을 지나가지 않는다(측정 절차와 대비책은 `docs/architecture/toolchain.md` §8.2).

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

**compound vs props** — 슬롯이 3개 이상이면 compound(`Tabs.Root/List/Tab/Panel`), 아니면 props(`Button variant`). Base UI 가 이미 compound인데 래퍼가 props 로 접으면 조합 가능성이 사라진다.

**컨트롤 보더** — 경계가 **유일한** 식별 수단인 컨트롤(빈 입력 필드, 라디오 외곽선)은 `border-ink-soft`(5.24:1)를 쓴다. `line`(1.28:1)은 WCAG 1.4.11 의 3:1 을 못 맞춘다. 반대로 텍스트가 있는 카드·버튼의 헤어라인 보더는 같은 기준이 **명시적으로 면제**한다.

## 게이트

`npm run build` 끝의 [`scripts/check-bundle-budget.mjs`](../../../scripts/check-bundle-budget.mjs) 가 번들 예산과 함께 **규범 1·2를 산출 CSS 에서 직접 검사**한다 — 그림자(값이 `none` 이 아닌 `box-shadow`)와 `prefers-color-scheme` 가 들어오면 빌드가 exit 1 로 죽는다. 위반 주입으로 실제로 잡히는 것을 확인했다.
