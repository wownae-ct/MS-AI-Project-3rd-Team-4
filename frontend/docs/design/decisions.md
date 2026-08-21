# 규범 결정 D1~D11

> **최종 갱신** 2026-08-21 · 각 절의 **상태** 줄이 적용 여부다 — 「제안」은 아직 코드에 없고, 「적용됨」은 날짜와 함께 적었다.
> D11 은 코드리뷰가 찾아낸 결함 수정이라 순서가 뒤바뀌었고, 그 사실을 해당 절에 남겼다.
>
> 맥락과 대안을 **결정 전에** 적는다(사후 정당화 방지 — `../adr/README.md` §절차와 같은 원칙).
> 구현 순서는 [implementation-plan.md](implementation-plan.md).

## 왜 지금 이 결정들이 필요한가

화면 6개 스펙이 도착했다([../mockups/README.md](../mockups/README.md)). 목업은 현재 `theme.css`와 **7색·라운드·서체 스택이 일치**한다(단 캔버스용 8번째 색 `--page-canvas: #EDEAE6`이 있다 — 목업 README 참조). 그러나 목업이 규범을 **넘어선 곳이 5종**이고, 그것을 그대로 옮기면 규범이 조용히 무너진다.

> ⚠️ **수치의 출처** — 아래 결정에 인용한 목업 수치는 두 출처가 섞여 있다. **저장소 안 정적 사본**(이 브랜치에서 재현 가능)과 **저장소 밖 인터랙티브 프로토타입**(재현 불가). 각 절에서 구분해 적었고, 규범 결정의 근거로 무게를 싣는 것은 **정적 사본 수치**다. 전체 대조표는 [../mockups/README.md](../mockups/README.md) 「규범을 넘어선 것」.

동시에 점검 중 더 큰 문제가 드러났다 — **규범이 강제된다고 적혀 있는데 실제로는 강제되지 않는 항목이 여러 개**다. D8·D10·D1이 그것이다.

원칙은 하나다 — **목업에서 값은 받지 않고 구조는 받는다.**

| 층 | 기준 | 목업의 지위 |
|---|---|---|
| **규범층** — 색 · 서체 · 형태 · 그림자 | 이 문서 | **제안서.** 채택은 이 문서 개정을 거친다 |
| **화면층** — 화면 목록 · 정보구조 · 데이터 요구 | [../mockups/](../mockups/README.md) | **사실상 스펙** |

---

## 결정 요약

| # | 결정 | 성격 | 적용 대상 |
|---|---|---|---|
| [D1](#d1-라운드를-4단계로-고정한다) | 라운드를 `sm 8 / md 10 / lg 16 / pill 999` **4단계로 고정**하고 기본 스케일을 폐기 | 구조 결함 수정 + 값 추가 | `theme.css` · `Card` |
| [D2](#d2-primary-면-채움을-면적으로-등급-분리한다) | primary 면 채움을 **면적으로 등급 분리** | 규범 해석 | 문서 · 화면 구현 |
| [D3](#d3-파스텔-그라디언트를-기각한다) | 파스텔 그라디언트 **기각** | 규범 적용 | 문서 |
| [D4](#d4-호버-색을-77354f로-확정한다) | 호버 `--color-primary-hover: #77354F` | 열린 결정 종결 | `theme.css` · `Button` |
| [D5](#d5-신규-중립색-1건-채택-1건-기각) | `#C9C3BC` 조건부 채택 / **`#A39C96` 기각** | 접근성 | 문서 (토큰은 보류) |
| [D6](#d6-상태-색을-도입하지-않는다) | 상태 색 **도입하지 않음** | 열린 결정 종결 | 스타일가이드 |
| [D7](#d7-반투명은-토큰-없이-opacity-modifier로-쓴다) | 반투명은 opacity modifier로 | 규약 | 문서 |
| [D8](#d8-팔레트-밖-색-서술을-사실에-맞게-고치고-게이트로-강제한다) | **팔레트 밖 색 서술 정정 + 게이트 신설** | **구조 결함 수정** | 문서 4곳 · 게이트 |
| [D9](#d9-ring--를-금지어로-둔다) | **`ring-*` 금지 + `outline-*`로 대체** — 폐기가 못 막으므로 게이트가 잡는다 | 금지 + 대체 수단 확정 | 규약 · 게이트 |
| [D10](#d10-그림자-네임스페이스를-폐기하고-게이트를-파서로-다시-만든다) | **그림자 4계열 폐기 + 게이트를 정규식에서 파서로** | **구조 결함 수정** | `theme.css` · 게이트 |
| [D11](#d11-불확정-진행률의-시각-표현) | 불확정 진행률을 **부분 막대**로 (0%도 100%도 아님) | **결함 수정** | ✅ **적용됨** — `Progress.tsx` |

**D1 · D8 · D10은 「값을 정하는 결정」이 아니라 「적혀 있는 것을 사실로 만드는 수정」이다.** 나머지와 성격이 다르다.

---

## D1. 라운드를 4단계로 고정한다

**상태: ✅ 적용됨 (2026-08-21) — `theme.css` 폐기 + 4단계. `Card` 의 `rounded-lg` 전환은 [implementation-plan.md](implementation-plan.md) C7**

### 맥락

`theme.css`는 `--radius-sm/md/pill` 3개를 정의한다. `src/shared/ui/README.md`의 토큰 표도 그 3개만 싣는다. 읽는 사람은 **"이 저장소의 라운드는 3단계"** 로 이해한다.

**사실이 아니다.** Tailwind 4.3.3의 기본 `--radius-*` 8단계가 그대로 살아 있다(설치본 `tailwindcss/theme.css` 실측):

```
--radius-xs 0.125rem(2px)  --radius-sm 0.25rem(4px)   --radius-md 0.375rem(6px)  --radius-lg 0.5rem(8px)
--radius-xl 0.75rem(12px)  --radius-2xl 1rem(16px)    --radius-3xl 1.5rem(24px)  --radius-4xl 2rem(32px)
```

`theme.css`가 한 것은 **폐기가 아니라 sm·md 덮어쓰기**다. 따라서 `rounded-lg`(8px) · `rounded-xl`(12px) · `rounded-2xl`(16px) · `rounded-3xl`(24px) · `rounded-4xl`(32px) · `rounded-xs`(2px)가 전부 생성된다.

한편 목업은 토큰 밖 라운드를 여럿 섞어 쓴다. **정적 사본 실측**(재현 가능): `50%`×13(원형) · `40px`×6 · `32px`×6 · `16px`×5 · `14px`×4 · `12px`×2 · `5px` `4px` `2px`. 프로토타입(재현 불가)에서는 16px×13 · 12px×11 · 6px×4 · 9px · 18px로 관측됐다. 어느 쪽이든 **결론은 같다 — 카드류는 16px로 수렴하고 나머지는 산재한다.** 현행 `Card`는 `rounded-md`(10px)다.

**부수 발견** — 산출 CSS에 `.rounded{border-radius:.25rem}`(토큰 밖 4px)이 실재했다. 어느 컴포넌트도 안 쓴다. 출처는 `Badge.tsx`·`Button.tsx` **주석**과 `README.md` 표의 bare `rounded` 문구 — Tailwind 스캐너가 주석을 구분하지 않는다. D1의 「4단계」를 **규범 문서 자신의 문장이** 위반하고 있었다. 상세와 조치는 [namespaces.md](namespaces.md) 「산문이 유틸리티를 만든다」.

### 검토한 대안

| 대안 | 장점 | 단점 | 판정 |
|---|---|---|---|
| 현행 유지(카드 10px) | 변경 0 | 목업과 6px 차이가 모든 카드에 누적된다 | 기각 |
| `--radius-lg`를 16px로 덮어쓰기만 | 최소 변경 | **`rounded-2xl`도 16px이라 이름이 둘이 된다.** 나머지 6단계도 그대로 살아 다단계 혼용을 못 막는다 | 기각 |
| 목업의 6개 값을 전부 토큰화 | 목업과 1:1 | **어느 라운드를 쓸지가 매번 판단이 된다.** 디자인 시스템의 목적과 반대 | 기각 |
| **`--radius-*: initial` 후 4단계 정의** ← 채택 | "4단계"가 문장이 아니라 **사실**이 된다. 색과 동일한 강제 방식이라 일관적이다 | `rounded-2xl` 등을 쓰던 코드가 있으면 깨진다 (현재 사용처 0건 — 실측) | — |

### 결정

```css
--radius-*: initial;
--radius-sm: 8px;
--radius-md: 10px;
--radius-lg: 16px;   /* 신규 — 카드 */
--radius-pill: 999px;
```

`Card`를 `rounded-md` → `rounded-lg`로 바꾼다. **스타일가이드의 카드 라운드가 눈에 띄게 바뀐다.**

16px을 택한 이유 — 목업이 카드에 일관되게 쓰는 값이고, 이 저장소가 경계로 삼아 온 "20px 이상의 과한 둥글기"에 못 미친다.

### 결과

- **쉬워지는 것**: 라운드 선택이 4개 중 하나로 좁혀진다. 문서의 서술이 사실과 일치한다
- **어려워지는 것**: 예외가 필요하면 임의값(`rounded-[12px]`)을 써야 하고, 그건 리뷰에서 눈에 띈다 — 의도한 마찰이다
- **되돌리려면**: `theme.css` 한 블록 되돌림 + `Card` 한 줄. 단 그 사이 `rounded-lg`를 쓴 코드가 있으면 함께 정리해야 하므로 **화면 구현 전에 하는 것이 싸다**
- **검증**: `scripts/lib/__tests__/`의 폐기 계약 테스트가 `compile()`로 `rounded-3xl` · `rounded-full`이 **생성되지 않음**을 상시 단언한다. `rounded-none`(`border-radius: 0`)은 살아남지만 토큰 밖 값이 아니라 「없음」이라 무해 — 이것도 **살아남는다고 단언**해 고정한다

**현재 사용처 실측** — `src/**/*.tsx`에서 `rounded-sm` 9 · `rounded-md` 4 · `rounded-pill` 3. 폐기 대상 단계 사용 **0건**이라 지금이 가장 싸다.

**컴파일로 확인한 것** — 폐기 후 `rounded-full`(`calc(infinity * 1px)`)도 함께 사라진다. `staticValues`라 살아남을 것이라는 추정이 있었으나 **틀렸다**(설치본 `compile()` 실측, [namespaces.md](namespaces.md) 표).

---

## D2. primary 면 채움을 면적으로 등급 분리한다

**상태: 제안 · 디자인 판단 필요**

### 맥락

The One Accent Rule은 *"배경 워시, 큰 면적 채우기로 쓰지 않는다"* 로만 적혀 있어 **경계가 없다.** 목업은 primary를 여러 크기로 쓴다 — 버튼(작음)부터 카드 전면(화면의 약 1/4)까지.

### 결정

| 용례 | 면적 | 판정 |
|---|---|---|
| 주요 버튼 · 배지 · 진행률 채움 | 소 | **허용** (현행 그대로) |
| 세그먼트 탭 활성 pill · 사이드바 활성 항목 | 소 | **허용** — 컨트롤 1개 크기 |
| 선택 카드 활성 (`primary-soft` 배경 + `primary` 보더) | 중 | **허용** — soft 톤이라 워시가 아니다 |
| **S5 「다음에 확인하면 좋아요」 카드 전면 채움** | 대 | **기각 권고** |

S5 대안: `surface` 카드 + `primary` 제목 + `primary-soft` 행 배경.

**부수 결정** — 프로토타입이 칩 활성색을 `primary`가 아니라 **`ink`(`#1D1B19`)** 로 쓴다. 세그먼트 탭(primary)과 필터 칩(ink)을 색으로 구분하는 것이고, 이는 One Accent Rule의 희소성 원칙과도 맞는다. **채택한다.**

### 결과

- 화면 인상을 가장 크게 바꾸는 항목이라 **승인 전까지 스타일가이드에 「열린 결정」으로 표시한다**
- 되돌림: 문서 한 줄. 화면 구현 전이라 코드 비용 0

---

## D3. 파스텔 그라디언트를 기각한다

**상태: 제안**

프로토타입(저장소 밖, 재현 불가) S3 벤치마크 막대에 `linear-gradient(90deg, #F1DEE7, #D9AFC4)` 1건이 관측됐다. **저장소 안 정적 사본에는 `linear-gradient`가 0건**이다 — 같은 막대가 이미 `ink-soft` + `opacity: .35` 단색으로 그려져 있다.

**The No-Pink-Cliché Rule** 과 정면으로 충돌한다. 그라디언트는 이 제품이 의식적으로 피해 온 표현이다.

**대안**: 단색 `line` 트랙 + `ink-soft` 반투명 구간 — 정적 사본이 이미 그렇게 그렸다. 같은 정보를 그라디언트 없이 전달한다.

**되돌림**: 문서 한 줄.

---

## D4. 호버 색을 #77354F로 확정한다

**상태: 토큰 ✅ 적용됨 (2026-08-21) — `--color-primary-hover`. `Button` 전환은 [implementation-plan.md](implementation-plan.md) C7**

### 맥락

호버 상태는 **열린 결정**으로 남아 있었다(`Button.tsx` 머리 주석 *"hover 상태는 「열린 결정」으로 남겼다"*). 현행 구현은 잠정값이다:

```
primary: "… hover:brightness-110 active:brightness-95"
```

문제가 둘이다.
1. **방향이 반대다.** `brightness-110`은 더 **밝게** 만든다. 프로토타입(저장소 밖, 재현 불가)은 더 **짙게** 간다 — `#77354F`, 호버 정의 27건 중 primary 버튼 9곳으로 관측. 정적 사본에는 `:hover`가 0건이라 여기서는 확인할 수 없다. **값 자체는 대비 실측(아래)으로 독립 검증했다.**
2. **필터다.** 규범은 *"호버는 그림자가 아니라 보더/배경의 옅은 변화로"* 인데 `filter: brightness()`는 배경 변화가 아니라 **요소 전체(자식 포함)의 밝기 조작**이다.

### 결정

```css
--color-primary-hover: #77354f;
```

`Button.tsx`:
```
primary: "… enabled:hover:bg-primary-hover enabled:active:bg-primary-hover"
```
`transition`에서 `filter`를 빼고, `disabled:hover:brightness-100` 상쇄를 제거한다.

**`enabled:`를 쓰는 이유** — 현행은 `hover:brightness-110`을 `disabled:hover:brightness-100`으로 되돌리는 구조다. 배경색으로 바꾸면서 같은 방식(`disabled:hover:bg-primary`)을 쓰면 **변이 정렬 순서에 의존**해 취약해진다. `enabled:hover:`는 애초에 적용되지 않게 해 상쇄 자체를 없앤다.

**대비 실측** — `#77354F` / `surface` = **8.73:1**. 흰 라벨을 얹어도 충분하다.

### 결과

- **열린 결정 하나가 닫힌다**
- 되돌림: 토큰 1줄 + `Button.tsx` 변이 3줄
- **범위에 포함** — `secondary`·`ghost`도 `disabled` 상태에서 hover가 적용된다(상쇄 규칙이 primary에만 있었다). 스타일가이드가 disabled secondary/ghost를 실제로 렌더하므로 눈에 보이는 결함이다. **3변이 전부 `enabled:hover:`로 통일한다** — primary만 고치면 같은 문제를 반쯤 남기는 셈이다

---

## D5. 신규 중립색 1건 채택, 1건 기각

**상태: 제안 · 토큰 추가는 보류**

목업이 팔레트 밖 색을 여럿 쓴다. 대비 계산(WCAG 상대휘도)으로 판정했다.

| 색 | 용도 | 대비(surface) | 판정 |
|---|---|---|---|
| `#C9C3BC` | S6 슬라이더 "이미 지급분" 잠금 구간 | 1.75:1 | **조건부 채택** — 비텍스트이고, 바로 아래 텍스트("3,000,000원 이미 지급 — 그 아래로는 못 줄여요")가 같은 정보를 전달한다. 색이 유일한 단서가 아니다 |
| `#A39C96` | 하단 탭바 **비활성 라벨** | **2.71:1** | **기각** — 읽어야 하는 텍스트다. WCAG 1.4.3(4.5:1) 미달. **`ink-soft`(5.24:1)로 대체한다** |

`#6E3150` · `#FBFAF9` · `#FBF6F8` · `#D9AFC4` · `#E4CBD8` · `#D8D3CD`, 그리고 `opacity: .55`로 만든 옅은 플럼은 **전부 기각** — 7색 + D4로 표현 가능하다.

**토큰(`--color-line-strong`) 추가는 지금 하지 않는다.** 쓰는 화면(S6)이 아직 없다. *"쓸 곳이 확정되지 않은 것을 미리 만들지 않는다"* 는 이 저장소의 기존 원칙(`../adr/0004-접근성-프리미티브로-base-ui를-채택한다.md`)을 따른다.

> ⚠️ **D8과의 충돌을 알고 보류한다.** D8의 색 게이트는 화이트리스트를 `theme.css`에서 읽는다. `#C9C3BC`는 「채택」이지만 토큰이 없으므로 **S6을 구현하는 순간 게이트가 막는다.** 그게 의도다 — 그때 이 절을 「토큰 추가」로 개정하고 `theme.css`에 넣으면 화이트리스트가 따라온다. 우회 플래그는 만들지 않는다.

**수치의 출처** — 위 색들은 전부 **프로토타입(저장소 밖)에서 관측**된 것이다. 정적 사본의 팔레트 밖 색은 `#EDEAE6`(캔버스 배경) 하나뿐이고 그 판정은 [layout.md](layout.md)의 데스크톱 여백 결정에 붙인다.

**되돌림**: 문서 한 줄. 토큰을 넣은 뒤라면 토큰 1줄 + 쓰는 곳.

---

## D6. 상태 색을 도입하지 않는다

**상태: 제안 — 열린 결정을 닫는 결정**

### 맥락

성공/경고/위험 같은 semantic color는 **"화면을 실제로 만들 때 정한다"** 로 유보돼 있었다. `theme.css`가 *"semantic color(성공/경고/위험)는 디자인 문서가 확정하지 않았다. 지어내지 않는다"* 고 명시하고, 스타일가이드가 「열린 결정」으로 화면에 띄우고 있다.

### 근거 — 추론이 아니라 6화면 실증

목업 6화면이 **상태 색 없이 전 상태를 표현했다.**

| 표현해야 하는 상태 | 목업의 해법 |
|---|---|
| 완료 / 진행중 / 예정 / 건너뜀 | `primary-soft`+`primary` / `bg`+`primary` 보더 / `bg`+`line` 보더 / `ink-soft` italic |
| **기한 지남** | `ink` 원형 테두리 + `!` — 빨강이 아니다 |
| GOOD / 주의 (업체 사례) | `primary-soft` / `bg`+`line` 보더 |
| 근거 확인됨 / 일반 정보 | `primary` 텍스트 / `ink-soft` 텍스트 |

**빨강·초록 0건.** 6개 화면 전부에서 그렇다.

### 결정

**상태 색을 도입하지 않는다.** 유보를 열어 두지 않고 닫는다.

열어 두면 구현 중에 누군가 색을 지어내는 자리가 남는다. 닫아 두면 상태를 색이 아닌 것(보더·배경 톤·텍스트·형태)으로 표현하게 되고, 그것은 WCAG 1.4.1(색만으로 정보를 전달하지 않는다)에도 유리하다.

### 결과

- 스타일가이드의 「열린 결정」 하나가 「규범」으로 바뀐다
- **되돌리려면**: 진짜로 색이 필요한 화면이 나왔을 때 이 항목을 폐기하고 새로 정한다. 그때 근거는 "그 화면에서 색 없이는 안 되는 이유"여야 한다
- ⚠️ **테스트 영향** — `StyleGuidePage.test.tsx`가 「열린 결정」 **하한**을 단언한다(`getAllByText("열린 결정").length >= 3`). 화면의 `<OpenDecision>`은 정확히 3건이라 D6이 하나를 닫으면 깨지고, D2가 하나를 열면 우연히 다시 3이 된다. 그 우연에 기대지 않고 **내용 단언**(어떤 결정이 열려 있고 어떤 것이 닫혔는지)으로 바꾼다. 같은 커밋에서([implementation-plan.md](implementation-plan.md))

---

## D7. 반투명은 토큰 없이 opacity modifier로 쓴다

**상태: 제안**

Tailwind v4의 opacity modifier가 `@theme` 커스텀 색에도 동작한다(설치본 실측):

```
bg-surface/12  →  color-mix(in oklab, var(--color-surface) 12%, transparent)
```

따라서 반투명용 토큰을 따로 만들지 않는다. 토큰을 이중으로 두면 값의 출처가 갈린다.

**되돌림**: 규약 한 줄. 토큰을 만들기로 하면 `theme.css` 추가 + 쓰는 곳.

⚠️ **`color-mix()`는 Chrome 111에서 처음 지원된다.** 현재 `build.target`이 `chrome111`이라 정확히 하한에 걸쳐 있다. 그보다 낮은 브라우저에서는 조용히 무효화되는데, **Tailwind v4 자체의 하한이 Chrome 111**이라 더 낮출 수도 없다.

---

## D8. 팔레트 밖 색 서술을 사실에 맞게 고치고 게이트로 강제한다

**상태: ✅ 적용됨 (2026-08-21) — 서술 정정(C2b) · 게이트(C3, 주입 시험 통과) — 구조 결함 수정**

### 문제

네 곳이 이렇게 적고 있다. **그중 두 곳은 스타일가이드 화면에 렌더된다.**

| 위치 | 서술 (인용문으로 찾는다 — 줄 번호는 썩는다) |
|---|---|
| `src/shared/ui/README.md` 코드 규약 3항 | *"위 7색 밖의 색은 유틸리티 자체가 생성되지 않는다"* |
| `src/shared/ui/theme.css` 머리 주석 | *"여기 없는 색은 유틸리티도 없다 — 그것이 … The One Accent Rule의 강제 방식이다"* |
| `pages/style-guide/ui/sections/FoundationSection.tsx` | **화면** — *"유틸리티 자체가 생성되지 않으므로, 하드코딩하면 화면에서 바로 드러납니다"* |
| `pages/style-guide/ui/sections/SystemSection.tsx` | **화면** — *"팔레트 밖 색 — 유틸리티 자체가 생성되지 않습니다"* |

**절반만 맞다.** Tailwind의 임의값 경로는 테마를 조회하지 않는다. 설치본 `tailwindcss/dist/lib.js`의 `bg` 유틸리티:

```js
functional("bg", a => {
  if (a.value) {
    if (a.value.kind === "arbitrary") {            // ← 임의값 분기
      … return [o("background-color", g)];         //   리터럴을 그대로 낸다
    }
    { let g = oe(a, e, ["--background-color","--color"]); … }   // ← 테마 조회는 여기서만
```

임의값 분기가 테마 조회보다 **먼저 반환한다.** `--color-*: initial`은 **명명 유틸리티 생성만** 막는다.
`bg-[#77354F]` · `[background-color:#77354F]` · `bg-(--anything)` 전부 컴파일된다.

같은 저장소에 이미 임의값이 쓰이고 있고 산출물에서 확인된다 — `Button.tsx`의 `px-[11px]` → 산출 CSS `padding-inline:11px`.

**Tailwind 설정으로 막을 수는 없다.** 공식 문서(「Adding custom styles」)가 임의값을 제한하는 설정을 제공하지 않고, `@utility`는 추가만 한다. 게이트가 유일한 수단이다.

### 결정

**두 가지를 한 쌍으로 한다.**

1. **서술 정정 (4곳)** → *"팔레트 밖 색은 **명명 유틸리티가 없다.** 임의값 우회로는 열려 있으므로 **빌드 게이트가 막는다.**"*
2. **색 화이트리스트 게이트 신설** — 화이트리스트를 `theme.css`에서 읽어 산출 CSS의 색 값과 대조한다. 소스측에서도 `bg-[#…]` 류 임의값을 `file:line`으로 보고한다

**서술만 고치고 게이트를 안 넣으면** 규범이 다시 사람 손에 맡겨진다. **게이트만 넣고 서술을 두면** 문서가 계속 틀린 말을 한다. 한 쌍이어야 한다.

### 게이트 설계 → [namespaces.md](namespaces.md) 「게이트 — 정규식이 아니라 파서로」

설계 본문은 거기 한 곳에만 둔다(초판은 여기와 거기에 같은 내용을 두었고 한쪽이 낡았다). 요지만: 화이트리스트는 `theme.css`에서 읽는다(이중 출처 금지) · 주석을 걷어내고 파싱한다 · 투명은 따로 센다 · 우회 플래그 없음 · 한계는 매 실행 출력.

### 결과

- **The One Accent Rule이 처음으로 실제 강제된다**
- **지금 넣는 것이 가장 싸다** — 화면 6개 구현 후에는 위반이 섞인 상태라 화이트리스트를 정직하게 만들 수 없다
- 이후 **모든 프론트 PR에 적용된다**. 오탐 시 빌드가 막히므로 위반 값과 위치를 함께 출력한다
- **우회 플래그를 만들지 않는다.** 새 색이 필요하면 이 문서 → `theme.css` 순서로 넣으면 화이트리스트가 자동으로 따라온다
- ⚠️ **D5와 충돌한다** — `#C9C3BC`는 채택됐지만 토큰이 없어 S6 구현 시 이 게이트가 막는다. D5가 그 순간 토큰을 추가하도록 설계돼 있다(의도한 마찰)
- **되돌림**: 게이트 모듈 1개 + 서술 4곳 revert. 단 게이트가 이미 잡아낸 위반이 있으면 그 코드도 함께 살아난다

---

## D9. `ring-*` 를 금지어로 둔다

**상태: ✅ 적용됨 (2026-08-21) — 규약(C2b) · 게이트가 `--tw-ring-*` 커스텀 속성과 소스 토큰을 잡는다(C3, `ring-primary` 주입 시험 통과)**

Tailwind v4의 `ring`은 여전히 **`box-shadow`로 컴파일된다**(설치본 실측):

```js
functional("ring", N => {
  if (!N.value) { … return [k(), o("--tw-ring-shadow", A(R)), o("box-shadow", a)] }    // ring
  if (N.value.kind === "arbitrary") { … "length" ? [… o("box-shadow", a)]              // ring-[3px]
                                              : [o("--tw-ring-color", R)] }            // ring-[#hex]
  { let R = oe(N, e, ["--ring-color","--color"]); if (R) return [o("--tw-ring-color", R)] }  // ring-primary
```

- `ring` · `ring-2` · `ring-[3px]` → **`box-shadow` 방출** → 값 검사에 잡힌다
- `ring-primary` · `ring-[#hex]` · `ring-inset` · `inset-ring-*` → **`--tw-ring-color` 같은 커스텀 속성만** 낸다. `box-shadow`가 없으므로 값 검사로는 **못 잡는다**. 혼자서는 화면에 링이 안 보이지만, 누군가 `ring-2`를 같이 붙이는 순간 완성된다 — 반쪽만 막으면 안 된다

**어느 네임스페이스 폐기로도 막히지 않는다.** `compile()` 실측: `--shadow-*` 등 5종을 전부 폐기해도 `ring` · `ring-2` · `ring-primary` · `inset-ring-2`가 **전부 생성**된다([namespaces.md](namespaces.md) 표). 그래서 D9는 규약(금지어)으로만 남을 수 없고 **게이트가 커스텀 속성(`--tw-ring-shadow` · `--tw-inset-ring-shadow` · `--tw-ring-color` · `--tw-inset-ring-color`)의 초기값 이외 값을 위반으로 잡는다.** 소스측에서는 `ring-` 클래스 토큰을 `file:line`으로 보고한다.

**결정: 링은 `outline-*`로 낸다.** (`outline-2 outline-offset-2 outline-primary`)
이 저장소는 이미 `:focus-visible { outline: 2px solid var(--color-primary) }` 를 전역에 두고 있고, Base UI 공식 문서도 같은 방식이다 — 설치본 `node_modules/@base-ui/react/docs/` 전체에서 `focus-visible:outline` 이 31개 파일 205회 등장한다(`ring` 방식은 쓰지 않는다).

**부수 사실 (v3에서 옮겨온 습관이 틀리는 지점)** — v4의 `ring` 기본 두께는 **1px**(v3는 3px), 기본 색은 **`currentcolor`**(v3는 `blue-500`). 설치본 소스 `e.get(["--default-ring-width"]) ?? "1px"` · `?? "currentcolor"` 로 확인.

**되돌림**: 규약 한 줄 + 게이트의 커스텀 속성 목록에서 ring 4종 제거. 단 `outline-*`로 바꾼 코드가 있으면 그대로 두어도 된다(둘 다 유효한 CSS).

---

## D10. 그림자 네임스페이스를 폐기하고 게이트를 파서로 다시 만든다

**상태: ✅ 적용됨 (2026-08-21) — 게이트(C3) · 폐기(C4). 유지 검사는 C5 — 구조 결함 수정**

### 문제 1 — "그림자 토큰을 두지 않는다"가 사실이 아니다

`theme.css` Shape 블록 끝 주석이 *"그림자 토큰을 두지 않는다 — The Flat-By-Default Rule"* 이라고 적는다. 그러나 폐기 선언이 없어 **Tailwind 기본 그림자 토큰 22개가 살아 있다**(설치본 `tailwindcss/theme.css` 전수):

| 네임스페이스 | 토큰 수 |
|---|---|
| `--shadow-*` | 8 (2xs · xs · sm · md · lg · xl · 2xl · inner) |
| `--drop-shadow-*` | 6 (xs · sm · md · lg · xl · 2xl) |
| `--inset-shadow-*` | 3 (2xs · xs · sm) |
| `--text-shadow-*` | 5 (2xs · xs · sm · md · lg) |

### 문제 2 — 게이트에 사각지대가 있고, 정규식으로는 닫히지 않는다

`scripts/check-bundle-budget.mjs`의 그림자 검사는 `box-shadow` 값을 보는 정규식 하나다(현행 `/box-shadow\s*:(?!\s*none\b)[^;}]+/gu` — 커밋 `3d518c6`이 백트래킹 오탐을 고친 형태).

| 유틸리티 | 실제 방출 (`compile()` 실측) | 현행 게이트 |
|---|---|---|
| `shadow-md` · `inset-shadow-sm` | `--tw-shadow: …` + `box-shadow: var(--tw-inset-shadow), …` | **잡힌다** |
| **`drop-shadow-md`** | `--tw-drop-shadow-size: drop-shadow(…)` + `filter: … var(--tw-drop-shadow,)` — **`filter:` 안에 `drop-shadow(`가 없다** | **통과한다** |
| **`text-shadow-sm`** | `text-shadow: …` | **통과한다** |
| **`ring-primary`** | `--tw-ring-color: var(--color-primary)` **만** | **통과한다** (D9) |

초판은 정규식을 3속성(`filter: … drop-shadow(`)으로 넓히자고 했다. **무동작이었을 것이다** — `filter:` 값에 `drop-shadow(`가 없으니 매치할 게 없다. 그리고 `ring-<color>`처럼 커스텀 속성만 내는 것은 속성 이름으로 영영 못 잡는다. 이건 정규식의 실수가 아니라 **한계**다.

### 결정 — 이중 방어, 2차는 파서로

**1차: 유틸리티 생성 자체를 막는다** (`theme.css`)
```css
--shadow-*: initial;
--drop-shadow-*: initial;
--inset-shadow-*: initial;
--text-shadow-*: initial;
```
`compile()`로 확인: 이 4줄이면 `shadow-*` · `drop-shadow-*` · `inset-shadow-*` · `text-shadow-*` **전부 생성되지 않는다.** 1차만으로 그림자는 닫힌다.

**2차: 산출 CSS를 `lightningcss` 파서로 본다** — 설계 본문은 [namespaces.md](namespaces.md) 「게이트 — 정규식이 아니라 파서로」 한 곳. 요지: `box-shadow`/`text-shadow` 선언의 **값**이 `none`이 아닌 것 · **어떤 값에든** `drop-shadow(` 함수 토큰 · `--tw-shadow`·`--tw-drop-shadow*`·`--tw-text-shadow*`·`--tw-ring-*`·`--tw-inset-ring-*` 가 초기값 이외인 것. 백트래킹 오탐이 구조적으로 불가능하고, **ring 구멍(D9)이 같이 닫힌다.**

**왜 둘 다인가** — 1차가 그림자를 닫고, 2차는 ① 누가 `initial` 줄을 지웠을 때 ② 임의값(`shadow-[0_1px_4px_#0003]`) ③ 인라인 스타일 ④ `ring-*` 를 잡는다. ④는 1차가 **애초에 못 막는** 영역이라 2차가 필수다.

### 재발 방지 — 폐기 유지 검사

D1·D8·D10의 근본 원인은 하나다 — **`-*: initial`을 안 하면 Tailwind 기본이 그대로 산다.** 폐기했더라도 나중에 누가 지우면 조용히 원상복귀한다.

**게이트가 `theme.css`에서 폐기 선언을 읽어, 필수 목록이 하나라도 빠지면 빌드를 실패시킨다.**

```js
const REQUIRED_RETIREMENTS = ["--color", "--radius", "--shadow", "--drop-shadow", "--inset-shadow", "--text-shadow"];
```

이것이 이 결정 묶음에서 가장 중요한 장치다. 값이나 서술이 아니라 **상태를 빌드가 지키게** 만든다.

### 결과

- `theme.css` 「그림자 토큰을 두지 않는다」 서술이 사실이 된다
- **되돌리려면**: 폐기 4줄 + 체커 모듈의 그림자 검사 + 필수 목록 1줄. 단 그 사이 그림자를 쓴 코드가 있으면 함께 정리
- **검증**: 폐기 계약 테스트(`compile()`)가 `shadow-md` · `drop-shadow-md` · `text-shadow-sm` **미생성**을 상시 단언. 게이트 픽스처 테스트가 `box-shadow: none`(공백 있음) **통과** · `--tw-drop-shadow: drop-shadow(…)` **위반**을 고정. 빌드 사이클 확인은 폐기 **전** 주입 1회(exit 1 + `file:line`)
- **순서 주의**: `REQUIRED_RETIREMENTS`(유지 검사)는 폐기 선언 **뒤** 커밋에 넣는다. 앞에 넣으면 그 사이 빌드가 깨진다 — 금지 게이트(상태 앞)와 유지 검사(상태 뒤)는 방향이 반대다

---

## D11. 불확정 진행률의 시각 표현

**상태: ✅ 적용됨 (2026-08-21) — 이 문서에서 유일하게 「제안」이 아닌 항목**

### 왜 순서가 뒤바뀌었나 — 먼저 밝힌다

이 저장소의 규칙은 *"값을 바꿀 때는 이 문서를 먼저 고치고 `theme.css`를 맞춘다"*([README.md](README.md) 갱신 규칙 1)이다. **D11은 그 순서를 지키지 못했다.** 코드리뷰가 찾아낸 **결함 수정**으로 먼저 코드에 들어갔고, 값의 근거가 문서에 없다는 지적을 받아 뒤늦게 기록한다. 규칙을 어긴 사실을 지우지 않고 남긴다.

### 맥락 — 고친 결함

`<Progress label="…" />`(값 미지정)가 **100% 채워진 완료 상태와 픽셀 단위로 동일하게** 그려지고 있었다.

Base UI 는 값이 없으면 인라인 width 를 **아예 설정하지 않는다**(`progress/indicator/ProgressIndicator.mjs` — `percentageValue == null ? {} : {…width}`). 라이브러리는 소비자가 `data-indeterminate` 에 스타일을 얹는 것을 전제하는데 그 처리가 없어서, 블록 요소의 `width:auto` 가 트랙 100% 로 계산됐다.

스타일가이드 캡션은 *"값을 모를 때 0%로 그리지 않습니다"* 였는데 **실제로는 0%가 아니라 100%로** 그렸다 — 더 나쁜 쪽이었다.

### 결정

```
data-indeterminate:w-2/5 data-indeterminate:animate-pulse
```

| 후보 | 판정 |
|---|---|
| `w-0` (빈 트랙) | **기각** — 0% 로 읽힌다. 값을 단정하지 않는다는 취지와 어긋난다 |
| `w-full` 유지(현행 방치) | **기각** — 완료와 구분되지 않는다. 이것이 고친 결함이다 |
| 슬라이딩 애니메이션(커스텀 keyframe) | 기각 — `--animate-*` 네임스페이스에 토큰을 새로 넣어야 한다. 결함 수정 범위를 넘는다 |
| **부분 막대(40%) + `animate-pulse`** ← 채택 | 0%도 100%도 아니고, 움직임이 「진행 중」을 전한다. Tailwind 기본 유틸리티만 쓴다 |

**40%(`w-2/5`)에 정밀한 근거는 없다.** 0%·100%와 충분히 떨어져 있고 Tailwind 기본 분수 유틸리티라는 것이 전부다. 더 나은 값이 있으면 바꿔도 되는 자리다 — 지켜야 할 것은 **0%도 100%도 아니어야 한다**는 것뿐이다.

### ⚠️ 알려진 한계 2가지

1. **`prefers-reduced-motion` 에서 움직임이 사라진다.** `styles.css` 가 전역으로 `animation-duration: 0.01ms !important` 를 걸고, `@keyframes pulse` 는 `50% { opacity: .5 }` 뿐이라 **정지한 40% 막대**가 된다. 완료(100%)와는 여전히 구분되므로 결함은 아니지만, 「움직임으로 알린다」는 의도는 그 환경에서 없어진다.
2. **테스트가 이 회귀를 막지 못한다.** jsdom 은 레이아웃을 계산하지 않아 *"폭이 100%가 아니다"* 를 단언할 수 없다. `StyleGuidePage.test.tsx` 의 테스트가 고정하는 것은 **두 상태가 DOM 에서 구분 가능하다**는 전제까지이고, 실제 증거는 산출 CSS 의 `[data-indeterminate]{width:40%}` 다. 이 한계를 테스트 주석에 적어 뒀다.

→ 시각 계약을 실제로 검사하려면 산출 CSS 를 보는 게이트가 필요하다. 자리는 이미 있다(`check-bundle-budget.mjs`, D8·D10 이 확장을 설계해 뒀다).

### 접근성 잔여 항목 (미해결)

Base UI 가 불확정 상태의 `aria-valuetext` **기본값**을 영어 `'indeterminate progress'` 로 둔다(`ProgressRoot.mjs` 의 `defaultAriaValueText` — 하드코딩이 아니라 덮어쓸 수 있는 기본값이다). 덮어쓰지 않으면 한국어 제품에서 스크린리더가 영어를 읽는다. `Progress.Root` 가 `getAriaValueText` 를 받으므로 넘겨서 해결한다 — **별건으로 남긴다.**

**되돌림**: `Progress.tsx` 의 `data-indeterminate:` 클래스 2개.

---

## 폐기하지 않는 네임스페이스

전수 감사와 사유는 [namespaces.md](namespaces.md). 요약하면 — `--text-*` · `--font-*` · `--spacing` · `--breakpoint-*` · `--container-*` 등은 **기본을 쓰기로 이미 결정된 항목**이라 유지한다. 폐기는 "규범이 금지한 것"에만 적용한다.
