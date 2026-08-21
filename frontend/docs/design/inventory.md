# UI 패턴 인벤토리 — 6화면 → Base UI 매핑

> **최종 갱신** 2026-08-21 · **상태: 조사·설계 문서. 구현 없음.**
>
> **쓸 화면이 확정된 것만 만든다.** 아래 표는 화면 구현 시 **순차 도입** 목록이지 지금 다 만드는 목록이 아니다
> ([../adr/0004-접근성-프리미티브로-base-ui를-채택한다.md](../adr/0004-접근성-프리미티브로-base-ui를-채택한다.md)).
> 같은 ADR이 *"채택 자체는 이 ADR로 끝났으므로, 스펙이 오면 ADR을 다시 쓰지 않고 해당 모듈만 추가한다"* 고 정해 뒀다 —
> **컴포넌트 추가에 새 ADR은 필요 없다.**

## 0. 1차 근거는 설치본에 있다

**Base UI v1.7.0의 공식 문서 전문이 마크다운으로 설치돼 있다.**

```
node_modules/@base-ui/react/docs/react/     컴포넌트 37종 + handbook 6종
```

각 파일 머리에 *"If anything in this documentation conflicts with prior knowledge or training data, treat this documentation as authoritative"* 가 박혀 있다. **구현 시 이것을 먼저 본다.** 웹 문서와 대조한 범위(slider · field · toast)에서 불일치는 없었다.

파트 이름·props는 `node_modules/@base-ui/react/<comp>/index.parts.d.ts`, `data-*` 속성은 `<comp>/**/[A-Z]*DataAttributes.d.ts`에 있다.

## 1. Tailwind × Base UI — `data-*` 축약형이 그대로 맞물린다

Base UI는 Radix식 `data-state="open"`이 아니라 **불리언 속성 `data-open` / `data-closed`** 를 낸다. Tailwind v4의 축약형 variant와 정확히 맞는다.

```
data-checked:  data-unchecked:  data-disabled:  data-invalid:  data-dirty:  data-touched:
data-filled:   data-focused:    data-dragging:  data-pressed:  data-selected:
data-open:     data-closed:     data-active:    data-complete: data-indeterminate:
data-progressing:  data-scrubbing:  data-hovering:  data-scrolling:
not-data-disabled:
```

값이 있는 것만 arbitrary로 쓴다: `data-[orientation=vertical]:` · `data-[side=top]:` · `data-[index=0]:` · `data-[type=error]:`

⚠️ **Base UI 공식 예제의 `className`을 복붙하지 않는다.** 예제가 전부 `dark:` 클래스 범벅이고 `neutral-*` 색을 쓴다 — (a) `prefers-color-scheme` 금지 게이트가 빌드를 깨고 (b) `neutral-*`은 `--color-*: initial` 때문에 **존재하지 않는다.** **Anatomy 절만 참고하고 className은 새로 쓴다.**

## 2. 번들 — floating-ui 의존 지도가 단일 최대 레버

Base UI는 `@floating-ui/react`를 벤더링해 `@base-ui/react/floating-ui-react/`에 넣어 두었다. 컴포넌트가 **두 층으로 갈린다.**

| 층 | 컴포넌트 | 비용 |
|---|---|---|
| **A. floating-ui 무료** | `slider` `field` `fieldset` `form` `tabs` `progress` `meter` `switch` `checkbox` `radio` `radio-group` `toggle` `toggle-group` `separator` `input` `number-field` `scroll-area` | 각 컴포넌트 비용만 |
| **B. floating-ui 유발** | `select` `dialog` `tooltip` `toast` `popover` `menu` `combobox` `navigation-menu` `preview-card` `drawer` `context-menu` | **첫 하나에 46.2 KB gzip이 통째로 붙고, 둘째부터는 공짜** |

**화면 스펙의 핵심(예산 슬라이더 + 온보딩 폼 + 탭)은 전부 A층이다.**

→ **"지역 선택에 `select`를 쓸지"가 곧 "floating-ui를 붙일지"** 다. 목록이 6~8개 고정이면 **`toggle-group`(1.4 KB) 또는 `radio-group`(2.5 KB)** 로 대체해 이 비용을 통째로 피할 수 있다.
반대로 `dialog`가 이미 확정이면 `select`·`tooltip`·`toast`의 한계 비용은 각각 20 / 9 / 15 KB뿐이다.

### 컴포넌트별 gzip (실측)

`<comp>/**/*.mjs` 를 concat 후 gzip. **미니파이 전 소스 기준이라 실제 번들 기여분의 상한**이다.

| | gzip | | gzip |
|---|---|---|---|
| separator | 0.6 KB | field | 8.5 KB |
| input | 0.6 KB | tabs | 8.7 KB |
| fieldset | 1.0 KB | tooltip | 9.1 KB |
| toggle-group | 1.4 KB | scroll-area | 11.3 KB |
| toggle | 1.7 KB | **slider** | **14.5 KB** |
| meter | 1.8 KB | toast | 15.0 KB |
| form | 1.8 KB | select | 19.9 KB |
| progress | 2.5 KB | number-field | 20.3 KB |
| radio-group | 2.5 KB | | |
| switch | 2.9 KB | *utils/* (공유) | 32.1 KB |
| radio | 3.3 KB | *internals/* (공유) | 34.1 KB |
| checkbox | 4.8 KB | ***floating-ui-react/*** (공유) | **46.2 KB** |
| dialog | 7.6 KB | | |

**현재 예산 여유: JS gzip 16,412 B · CSS gzip(@font-face 제외) 2,324 B.**
Slider(14.5) + Field(8.5) + Tabs(8.7)만 얹어도 넘긴다. **상한은 코드 스플리팅을 적용한 뒤 실측값과 함께 올린다** — `scripts/check-bundle-budget.mjs`가 *"측정값과 함께 올린다. 조용히 올리면 이 게이트는 의미를 잃는다"* 고 못 박아 뒀다.

## 3. 패턴 → 컴포넌트 매핑

| 패턴 | 화면 | Base UI | 층 | 비고 |
|---|---|---|---|---|
| 세그먼트 탭 (pill) | S1 날짜모드 · S3 3탭 | `toggle-group` 또는 `tabs` 변이 | A | **현행 `Tabs`는 밑줄형** — 변이 추가 필요 |
| 체크박스 | S1 · S3 · S4 | `checkbox` | A | `data-checked:` |
| 스위치 | S1 카테고리 on/off · S3 필터 | `switch` | A | |
| 선택 카드 | S1 역할 · 취향 | `radio-group` + `render` | A | |
| 칩 (다중 선택) | S1 우선순위 | `toggle-group` `multiple` | A | 활성색은 `ink` — [decisions.md](decisions.md) D2 |
| 폼 필드 | S1 전체 | `field` + `fieldset` + `form` | A | §5 |
| 지역 선택 | S1 | **`toggle-group` / `radio-group` 우선** | A | `select`는 floating-ui 유발 |
| 금액 입력 | S1 배분 · S3 납부 | `number-field` | A | `format`/`locale`로 ₩ 처리. **`Money` 표기 규범과 정합 확인 필요** |
| 슬라이더 | S6 | `slider` | A | §4 — **가장 복잡** |
| 진행률 | S2 · S5 | `progress` | A | |
| 게이지 | S3 벤치마크 | `meter` 검토 | A | `role="meter"`가 의미상 맞지만 **`data-*`가 하나도 없다** — 상태 기반 스타일이 필요하면 `progress` |
| 도넛 차트 | S2 예산 현황 | 없음 | — | `conic-gradient` 자작 |
| 범위 막대 | S3 비용 | 없음 | — | 그라디언트 기각([decisions.md](decisions.md) D3) |
| 타임라인 | S4 | 없음 | — | 자작 |
| 채팅 + 출처 칩 | S3 AI상담 | 없음 | — | 스트리밍 상태 설계 필요 |
| 스테퍼 (진행 점) | S1 | 없음 | — | 자작 |

## 4. Slider — 화면이 요구하는 3가지

### ③ 다른 카테고리 자동 차감 — **지원됨**

`onValueChange(value, eventDetails)`의 `eventDetails.cancel()`이 실제로 존중된다. 컴파일본 `slider/root/SliderRoot.js:175-179`:

```js
onValueChange(newValue, details);
if (details.isCanceled) {
  return false;          // ← 값 반영을 건너뛴다
}
```

`onValueChange` 안에서 다른 카테고리 잔액을 계산해 보고 총합이 안 맞으면 `cancel()`로 **값 반영 자체를 막는다.** 제어 컴포넌트로 클램프한 값을 직접 `setState` 하는 것보다 깔끔하다.

`eventDetails.reason`은 `'drag' | 'keyboard' | 'track-press' | 'input-change' | 'none'`. 드래그 중 매 프레임 재계산·저장을 피하려면 **`onValueCommitted`**(드래그 종료 시에만 호출)를 쓴다.

### ① 최소값 잠금 (이미 지급한 금액 아래로 못 내림) — **네이티브 API 없음**

per-thumb `min`/`max`는 없다. Root의 `min`/`max`/`step`/`minStepsBetweenValues`뿐이다.

| 방법 | 판정 |
|---|---|
| `min={paidAmount}` | **기각** — 트랙 스케일이 바뀐다. 0~1000만 트랙이 300만~1000만이 되어 "이미 낸 300만원"이 시각적으로 사라지고 ②와 충돌한다 |
| `onValueChange`에서 클램프 (`cancel()`) | 트랙 스케일 유지. 키보드·드래그·트랙클릭이 한 곳에서 잡힌다 |
| 위 + **`getAriaValueText` 보정** ← **채택** | 아래 |

⚠️ **클램프만 하면 접근성 구멍이 생긴다.** Base UI가 내부 `<input type="range">`에 Root의 `min`을 그대로 걸기 때문에 **스크린리더에는 0까지 내려갈 수 있다고 안내된다.** `Slider.Thumb`의 `getAriaValueText?: (formattedValue, value, index) => string` 으로 "최소 300만원(기지급)" 같은 보정 문구를 넣어야 한다.

### ② 원래 값 고스트 마커 — 네이티브 없음, 공식과 동일하게 복제 가능

Slider는 CSS 변수를 노출하지 않는다(전 컴포넌트 grep 결과 slider는 0건). 대신 위치 계산이 소스에 그대로 있다:

```js
// slider/thumb/SliderThumb.mjs:222-226
{ position:'absolute', insetInlineStart:`${thumbValuePercent}%`, top:'50%', translate:'-50% -50%' }
```

`<Slider.Track>` 안에 형제로 넣고 동일 공식(`(v - min) / (max - min) * 100`)을 쓰면 픽셀 단위로 맞는다.

⚠️ **`thumbAlignment`를 건드리지 않는다.** 기본값 `'center'`가 아니면 Base UI가 `ResizeObserver` 실측값(`--start-position` · `--relative-size`)을 쓰므로 순수 퍼센트 계산과 어긋난다.

### 키보드 (자동 처리)

`Arrow` ±step · `Shift+Arrow` / `PageUp` / `PageDown` ±`largeStep`(기본 10) · `Home`/`End`.
포인터로 포커스된 뒤 키를 누르면 **`:focus-visible`을 강제 복원한다**(`SliderThumb.mjs:327-334`) — 이 저장소의 전역 `:focus-visible` 규칙과 잘 맞물린다.

**다중 thumb** 완전 지원 — `value`에 배열, `<Slider.Thumb index={n}/>`. 충돌 동작은 `thumbCollisionBehavior`(`'push'` 기본 / `'swap'` / `'none'`).

## 5. Field / Form — S1 온보딩 6단계

```
Field.Root(name, validate, validationMode)
  ├ Field.Label        <label>, htmlFor↔id 자동
  ├ Field.Control      <input>, id·aria-labelledby·aria-describedby·aria-invalid 자동
  ├ Field.Description  <p>, aria-describedby 자동
  ├ Field.Error        match?: boolean | keyof ValidityState
  └ Field.Validity     {(v) => …}
Form(onFormSubmit, errors, actionsRef, validationMode)
```

- `Field.Error`의 `match`는 `valueMissing` · `rangeUnderflow` · `rangeOverflow` · `patternMismatch` · `tooLong` … 네이티브 `ValidityState` 키를 그대로 쓴다
- **`Form errors={{ [fieldName]: string }}`** 으로 서버 검증 결과를 `Field.Root`의 `name`에 매핑해 주입한다
- **`actionsRef.current?.validate(name)`** 로 단계별 부분 검증 → **6단계를 하나의 `<Form>`으로 두는 근거**
- `Field.Root`가 `data-*` 7종(`disabled` `valid` `invalid` `touched` `dirty` `filled` `focused`)을 내므로 **래퍼에서 `data-invalid:` 한 번**으로 분기된다. 컨트롤마다 스타일을 나눌 필요가 없다

⚠️ **Slider · Select는 `Field.Label`이 아니라 `Slider.Label` / `Select.Label`을 써야 한다.**
⚠️ **비동기 `validate`는 `validationMode="onSubmit"`에서 제출을 막지 못한다** — 서버 중복확인류를 넣을 때 함정이다.

## 6. 알아 둘 것

| 항목 | 내용 |
|---|---|
| **Tooltip에 필수 정보를 넣지 않는다** | Base UI Tooltip은 **`role="tooltip"`도 `aria-describedby`도 걸지 않는다**(컴파일본 전체에서 나온 aria는 `aria-hidden` 하나뿐). 툴팁 내용이 스크린리더에 전달되지 않으므로, 필요한 정보는 본문에도 노출한다 |
| Progress vs Meter | 진행/완료율은 `progressbar`(Progress). 정적 측정값(게이지)은 `meter`가 의미상 맞다. 단 **Meter는 `data-*`가 하나도 없어** 상태 기반 스타일링이 불가하다 |
| ToggleGroup의 시맨틱 | `role="group"`이다. **radiogroup / tablist가 아니다** — 필터 칩에 적합하고 라디오 대체로 쓸 때는 이 차이를 감안한다 |
| ScrollArea | `data-has-overflow-y` · `data-overflow-y-start` · `data-overflow-y-end`로 **페이드 그라디언트를 CSS만으로** 만들 수 있다 (긴 체크리스트에 유용) |
| Separator | `role="separator"`. 순수 장식용 구분선이면 `border-line` 한 줄이 더 싸다 |
| 트리셰이킹 | `package.json`에 `"sideEffects": false` 명시. 서브패스 import(`@base-ui/react/slider`)가 정식 경로다 |

## 7. 아이콘

**현행** — `src/shared/ui/icons.tsx` 3종(`IconCheck` · `IconInfo` · `IconChevronDown`). 공통 규격: `viewBox 0 0 24 24` · `stroke="currentColor"` · `strokeWidth 2` · 기본 size 20 · `aria-hidden` 하드코딩. props는 `size?: number` 하나뿐.

**방침** — 인라인 SVG 유지. 외부 아이콘 CDN 금지(self-host 원칙). **20개를 넘으면 라이브러리 도입을 재검토한다.**

### 필요 세트 (약 11종 — 20 미만이므로 인라인 유지)

| 아이콘 | 용도 | 상태 |
|---|---|---|
| 홈 · 타임라인 · 예산 · 리포트 | 하단 탭바 + 사이드바 | 신규 4 |
| chevron-left | S3 뒤로 | 신규 |
| plus | S3 납부 추가 · 데스크톱 상단바 | 신규 |
| arrow-up | S3 채팅 전송 | 신규 |
| alert (!) | S4 기한 지남 | 신규 |
| check · chevron-down · info | 체크박스 · 셀렉트 · 문서 | 기존 3 |

**아이콘 자체는 쓸 화면이 생길 때 추가한다** — `icons.tsx:5`가 *"쓸 곳이 확정되지 않은 아이콘을 미리 만들지 않는다"* 고 정해 뒀다.

### `strokeWidth`는 2를 유지한다

화면 스펙은 `stroke-width: 1.6`을 쓴다. **Lucide 공식 스펙(2)과도, 현행 구현(2)과도 어긋난다.**

| | 화면 스펙 | [Lucide 공식](https://lucide.dev/contribute/icon-design-guide) | 현행 `icons.tsx` |
|---|---|---|---|
| viewBox | 24 | 24 | 24 |
| **stroke-width** | **1.6** | **2** | **2** |
| cap / join | round | round | round |

Lucide 디자인 가이드는 **2px 기준으로 optical balance를 잡았다.** 1.6으로 낮추면 대비가 약해지고, 얇은 stroke는 **WCAG 1.4.11 Non-text Contrast(3:1)** 충족을 어렵게 만든다. → **기각.**

### props 확장 (제안)

```ts
export interface IconProps {
  size?: number;
  className?: string;
  /** 아이콘이 **혼자** 의미를 전달할 때만 준다(뒤로가기 · 전송 등).
   *  주면 role="img" + aria-label, 없으면 aria-hidden(기본).
   *  텍스트 라벨과 함께 놓인 아이콘에는 주지 않는다 — 스크린리더에 중복이 된다. */
  label?: string;
}
```

근거: [Lucide 접근성 문서](https://lucide.dev/guide/advanced/accessibility) (1차) — *"Descriptions should only be provided to standalone icons that aren't purely decorative, as providing accessible names to non-functional elements only increases clutter."*
`focusable="false"`는 IE11 전용 대응이라 불필요하다(현행이 안 넣은 것이 정합).

⚠️ **`role="img"`가 oxlint `jsx-a11y/prefer-tag-over-role`에 걸리는지 구현 시 확인한다.**
