# 레이아웃 · 앱 셸 · 내비게이션

> **최종 갱신** 2026-08-22 · **상태: 계약 문서 — §1·§2·§5·§6 구현됨**([ADR 0005](../adr/0005-라우터로-tanstack-router를-채택한다.md) 라우터 도입 커밋).
>
> 구현된 것: 라우트 표(§2) · 셸 규칙 중 **온보딩 크롬 없음**(§1) · 내비 접근성 계약 전부(§5) · `Page` 분리(§6).
> 구현체는 `src/app/router/router.tsx`(라우트 트리) · `src/app/ui/AppShell.tsx` · `src/app/ui/NavItem.tsx` 이고,
> §5 의 계약은 `src/app/ui/AppShell.test.tsx` 가 **테스트로 고정**한다(적어 둔 것만으로는 지켜지지 않는다).
>
> 아직 계약으로만 남은 것: 데스크톱 **상단바**(§4 — 제목·D-Day·주요 액션) · 사이드바 **브랜드/하단 블록**(§4 ⚠️ 미결) ·
> 화면별 폭 실제 적용(§7 — `Page` 가 `width` prop 을 받게 됐고 값은 화면 구현 때 넘긴다) · §9 의 미정 항목들.

## 1. 셸 규칙

화면 스펙(프로토타입)이 셸 조건을 **코드로** 명시하고 있다. 이것이 계약이다.

```js
showSidebar = showDesktopBar = !mobile && !onboarding
showTabBar  =  mobile && !onboarding
showPageTitle = mobile                    // 데스크톱은 상단바가 제목을 담당한다
tabHome active = (screen === 'dashboard' || screen === 'category')
```

읽어야 할 것 세 가지:

1. **온보딩은 크롬이 없다.** 탭바도 사이드바도 상단바도 붙지 않는다
2. **제목의 소재지가 플랫폼마다 다르다.** 모바일은 페이지 안, 데스크톱은 상단바
3. **카테고리 상세(S3)는 독립 탭이 아니라 홈 탭에 귀속되는 하위 화면이다.** 화면 보드의 서술도 같다 — *"카테고리 상세는 홈에서 진입하는 하위 화면으로 두었습니다."*

## 2. 라우트 표

| 경로 | 화면 | 셸 | 탭 활성 | 데스크톱 폭 |
|---|---|---|---|---|
| `/onboarding` | S1 온보딩 (6단계) | **없음** | — | `max-width: 430px` 중앙 |
| `/` | S2 대시보드 | 있음 | 홈 | `repeat(auto-fit, minmax(320px, 1fr))` |
| `/category/:id` | S3 카테고리 상세 (3탭) | 있음 | **홈** | 2열 |
| `/timeline` | S4 타임라인 | 있음 | 타임라인 | `max-width: 640px` 단일 열 |
| `/budget` | S6 예산 재배분 | 있음 | 예산 | `max-width: 720px` |
| `/report` | S5 리포트 | 있음 | 리포트 | `repeat(auto-fit, minmax(260px, 1fr))` |

**미정** — S3의 3탭(체크리스트 / 비용 / AI상담)을 URL에 반영할지. 공유 링크와 뒤로가기 동작이 갈린다.

## 3. 모바일 (기준 390pt)

- 하단 탭바 4개: 홈 · 타임라인 · 예산 · 리포트
- 콘텐츠 스크롤 영역 패딩 `14px 18px 26px`
- 비활성 탭 라벨은 **`ink-soft`** — 화면 스펙의 `#A39C96`은 대비 2.71:1로 기각했다([a11y.md](a11y.md) §3.2)

### 3.1 아이콘 + 텍스트 라벨 병기, 상시 표시

Nielsen Norman Group, [Icon Usability](https://www.nngroup.com/articles/icon-usability/) (1차):

> "**a text label must be present alongside an icon** to clarify its meaning in that particular context."
> "**icon labels should be visible at all times, without any interaction from the user**"

보편적으로 인식되는 아이콘은 home · print · 돋보기 정도뿐이다. **"타임라인 · 예산 · 리포트" 같은 도메인 개념은 명백히 그 밖**이므로 텍스트 라벨이 필수다.

부수 효과 — 라벨을 항상 표시하면 탭 아이템 높이가 자연히 44px 이상이 되어 터치 타겟 요구를 함께 만족한다.

### 3.2 safe-area — 2단계 세트다

프로토타입의 하단 패딩 `22px`은 iOS 홈 인디케이터를 피하려는 상수다. **환경 변수로 대체한다.**

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```
```css
padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
```

⚠️ **`viewport-fit=cover` 없이 `env()`만 쓰면 값이 항상 0이다.** 둘 중 하나만으로는 동작하지 않는다 ([MDN env()](https://developer.mozilla.org/en-US/docs/Web/CSS/env) · [MDN viewport](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport), 1차).

⚠️ `user-scalable` · `maximum-scale`은 **넣지 않는다** — WCAG 1.4.4 위반([a11y.md](a11y.md) §2.4).

## 4. 데스크톱 (기준 1160px)

- 셸 `width: min(1160px, 100%)` · 좌측 사이드바 **232px** 고정 + 콘텐츠
- 콘텐츠 패딩 `26px 32px 40px` · 배경 `bg`
- 사이드바: 브랜드 → 주 내비 4 → 구분선 → 보조 링크 → 하단 블록
- 상단바: 화면 제목 + 부제(좌) / D-Day 배지 + 주요 액션(우)

### ⚠️ 사이드바 하단 블록

화면 스펙에는 아바타 원형 + 이름 + 역할이 있다. **아바타 원형은 계정 UI로 읽힌다.** 이 제품에 로그인·계정 개념이 있는지 확인되지 않았다.

**온보딩 입력값 요약(결혼 예정일 · D-Day · 역할)으로 재설계하거나 제거한다.** 구현 전 결정 필요.

## 5. 내비게이션 접근성 계약

| 항목 | 계약 | 근거 |
|---|---|---|
| 마크업 | **`<nav>` 랜드마크 + 링크 리스트** | [ARIA APG Navigation Landmark](https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/navigation.html) (1차) |
| **`role="tablist"` 금지** | 탭 위젯은 **같은 페이지 내 패널 전환용**이다. URL이 바뀌는 라우트 내비게이션에 쓰지 않는다 | 위와 같음 |
| 현재 항목 | **`aria-current="page"`** — 집합 내 오직 하나 | [MDN aria-current](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-current) (1차) |
| 복수 `<nav>` | 탭바와 사이드바가 함께 있으면 `<nav>`가 2개다 → **각각 고유 `aria-label` 필수** | APG: *"If a page includes more than one navigation landmark, each should have a unique label."* |
| 모바일↔데스크톱 전환 | **단일 DOM + CSS 재배치.** DOM을 이중으로 두지 않는다 | W3C는 *"designers not stray from source order when creating a CSS layout"* 을 권고한다 — 포커스 순서와 읽기 순서가 소스 순서를 따르기 때문 |

**DOM 이중화를 피하는 이유** — 중복 랜드마크가 스크린리더의 랜드마크 목록을 어지럽히고, 숨기는 쪽을 `display: none`으로 하지 않으면 **키보드 포커스가 보이지 않는 내비게이션으로 들어간다**(`aria-hidden="true"`만으로는 막지 못한다).

> ARIA APG에 **하단 탭바 / 사이드바 전용 패턴은 없다**(확인함). 둘 다 navigation 랜드마크 + 링크 리스트로 마크업하는 것이 정석이다.

## 6. `Page.tsx` 분리 방향

현행 `Page`는 `min-h-dvh bg-bg` + 스킵링크 + 헤더 + `<main>`을 **한 덩어리로** 렌더한다. 앱 셸이 들어오면 맞지 않는다.

**`AppShell`**(스킵링크 · nav · 상단바) / **`Page`**(제목 · 콘텐츠 열)로 나눈다.

유지할 것:
- 스킵 링크 → `#page-content`
- `<h1 tabIndex={-1}>` + `focusOnMount` — **라우터가 들어와야 비로소 제 역할을 한다**(화면이 바뀌어도 포커스는 body에 남는다)
- `<main id="page-content">` 랜드마크

### ✅ 구현 결과 — 3계층이 됐다 (2026-08-22)

위 2분할로는 **온보딩에서 스킵 링크가 사라진다.** 온보딩은 셸 밖이므로(§1) `AppShell`에 넣은 것은 아무것도 받지 못한다.
그래서 셸 계층을 하나 더 바깥으로 두어 나눴다:

| 계층 | 위치 | 담당 | 적용 범위 |
|---|---|---|---|
| **루트 라우트** | `app/router/router.tsx` | 스킵 링크 · `min-h-dvh bg-bg` | **모든 화면** (온보딩 포함) |
| **`AppShell`** | `app/ui/AppShell.tsx` | 탭바/사이드바 · 콘텐츠 하단 여백 | `_shell` 밑 화면만 |
| **`Page`** | `shared/ui/Page.tsx` | 제목 헤더 · `<main>` · 열 폭(`width`) | 모든 화면 |

**스킵 링크가 `AppShell`이 아니라 루트에 있는 이유가 이것이다.** §6 본문의 의도(= `Page`에서 빼서 셸 계층으로 올린다)는 지켜졌고,
"어느 셸 계층인가"만 정밀해졌다. 이 배치는 `app/App.test.tsx`의 *"셸이 없어도 스킵 링크는 있다"* 가 고정한다.

`Page`는 `width` prop 을 받는다 — §2 라우트 표의 화면별 폭을 넘기기 위해서다. ⚠️ **Tailwind 클래스 리터럴로만** 넘긴다
(`` `max-w-[${n}px]` `` 로 조립하면 스캐너가 못 찾아 빌드는 성공한 채 폭만 사라진다 — CLAUDE.md §5.1).

## 7. 화면별 폭과 컨테이너 쿼리

`auto-fit` 그리드는 브레이크포인트를 늘리지 않고 카드가 스스로 재배치되게 한다.

⚠️ **`Card`가 이미 `@container`를 달고 있다.** 이는 `container-type: inline-size`를 설정해 **자식의 퍼센트 폭 계산 기준을 바꾼다.** 슬라이더 고스트 마커([inventory.md](inventory.md) §4 ②)처럼 퍼센트로 위치를 잡는 요소를 카드 안에 넣을 때 확인이 필요하다.

## 8. 라우터 — 결정 전 조사 결과

**라우터 선택은 ADR 0005로 확정한다** — 번호는 예약돼 있고 **아직 작성되지 않았다**(`src/app/App.tsx`·`App.test.tsx` 주석이 0005를 참조하고 있어 번호를 비워 둔 것. [../adr/README.md](../adr/README.md)). 아래는 그 ADR의 입력이다.

**제약: JS 번들 예산 여유가 약 16.4~16.8 kB(gzip)뿐이다.** 한도 92,000 B 대비 — 게이트 `measured` 기준선(75,223)으로는 16,777 B, 2026-08-21 빌드 실측(75,588)으로는 16,412 B. **두 값이 갈리는 것 자체가 결함**이다(`measured`가 실측을 따라가지 못함 → [implementation-plan.md](implementation-plan.md) C5에서 기준선을 갱신한다). 여기서는 보수적으로 작은 쪽을 쓴다.

| 패키지 | 최신 | React peer | gzip (barrel 상한) | 확인 |
|---|---|---|---|---|
| `react-router` | **8.3.0** | **`>=19.2.7`** (현재 `^19.2.8` 충족) | 59,247 B | npm 레지스트리 + bundlephobia |
| `@tanstack/react-router` | 1.170.31 | `>=18 \|\| >=19` | 39,351 B | 위와 같음 |
| `wouter` | 3.10.0 | `>=16.8.0` | **2,598 B** | 위와 같음 |

⚠️ **위 gzip은 barrel import 기준 상한**이다. tree-shaking 후 실제 크기는 더 작다. **정확한 값은 실제로 설치해 빌드해서 재야 한다.**

**알아 둘 것**
- `react-router-dom`은 **v8에서 제거**됐다. v8은 `react-router` 하나이고 DOM 전용 API는 `react-router/dom`에서 가져온다
- v8은 **ESM 전용**이고 React **≥19.2.7을 강제**한다
- **v8의 자동 코드 스플리팅은 Framework 모드 전용**이다. 정적 SPA 호스팅에서는 Declarative / Data 모드 + 수동 `lazy` 조합이 현실적이다
- `wouter`는 코드 스플리팅 내장이 없다 — `React.lazy` + `<Suspense>`를 직접 조합한다

**호스팅 연동** — SPA는 서버 폴백이 필요하다. 저장소에는 **`staticwebapp.config.template.json`**(초안)만 있고 배포본 `staticwebapp.config.json`은 **아직 생성되지 않았다**(`__API_HOST__` 치환이 배포 호스트 확정을 기다린다). template에 이미 들어 있는 것:
```json
{ "navigationFallback": { "rewrite": "/index.html", "exclude": ["/assets/*"] } }
```
**아직 없는 것** — 자산 캐시 헤더(`/assets/*`에 `public, max-age=31536000, immutable`). 해시 파일명이라 안전하고 호스트와 무관하므로 **template 단계에서 미리 넣을 수 있다**(`../architecture/toolchain.md` 「배포 시 필요한 캐시 헤더」). 라우터 도입 시 같은 파일을 만지므로 함께 처리한다.

## 9. 화면 스펙이 답하지 않는 것

구현 착수 전에 채워야 한다. 지어내지 않는다.

| 항목 | 내용 |
|---|---|
| **로딩 · 빈 · 오류 상태** | 6화면 전부 **0건**. AI 상담 스트리밍 중 화면도 없다 |
| **폼 검증 · 오류 메시지** | S1의 총예산 · 하객 수 입력에 검증 규칙이 없다 |
| **S6 재분배 규칙** | 한 카테고리를 올리면 **어디서 빼는지**가 없다. "남은예산은 변하지 않는다"만 있다 |
| **브레이크포인트 수치** | 1160px 하나뿐이고 390~1160 사이 구간이 없다 |
| **사이드바 하단 블록** | §4 참조 |
