# design — 디자인 규범

> **최종 갱신** 2026-08-22 (D2 종결 · `Card` 부제 슬롯 · 컴포넌트 스펙 2건 정정) · **문서 소유** 프론트 담당
>
> ⚠️ **이 폴더의 「제안」 항목은 아직 코드에 적용되지 않았다.** 각 문서가 **현행**과 **제안(미적용)** 을
> 항목마다 표시한다. 표시 없이 규범을 서술하지 않는다 — 이 저장소는 *"막았다고 적었지만 실제로는 안 막힌"*
> 상태로 여러 번 손해를 봤고, 그 재발을 막는 것이 이 폴더의 존재 이유 중 하나다([namespaces.md](namespaces.md)).

## 이 폴더가 무엇인가

**프론트엔드 디자인 규범의 SSOT.** 색·서체·형태·접근성·레이아웃의 값과 그 근거가 여기 있다.

값의 **소재지**는 `src/shared/ui/theme.css`(Tailwind `@theme`)이고, **왜 그 값인지**가 여기다.
값을 바꿀 때는 [decisions.md](decisions.md)를 먼저 고치고 `theme.css`를 맞춘다. 반대 순서로 하지 않는다.

### 자립 원칙

**이 폴더의 문서는 `frontend/` 밖을 참조하지 않는다.** 다른 브랜치의 파일, 저장소 루트 파일, git 히스토리의
문서를 규범의 근거로 인용하지 않는다. 프론트엔드 브랜치에서 열 수 없거나 고칠 수 없는 것에 규범을 의존시키면
그 규범은 유지될 수 없다.

외부 **기술 문서**(W3C·MDN·WHATWG·Tailwind·Base UI·KRDS·npm 레지스트리)는 근거로 적극 인용하고, **URL과
확인 등급**을 함께 적는다.

## 문서 색인

| 문서 | 내용 |
|---|---|
| [decisions.md](decisions.md) | 규범 결정 D1~D11 — 맥락 · 대안 · 결정 · 적용 지점 · 되돌림 비용 |
| [a11y.md](a11y.md) | 접근성 정책 — 터치 타겟 · 글자 크기 · 대비. 표준 원문과 **근거 등급** |
| [namespaces.md](namespaces.md) | Tailwind 네임스페이스 폐기 감사 + **게이트 설계의 정본** — 「덮어쓰기」와 「폐기」는 다르다 · 폐기가 실제로 막는 범위(컴파일 실측) · 파서 기반 게이트 |
| [layout.md](layout.md) | 앱 셸 계약 · 라우트 표 · 내비게이션 접근성 · 화면별 폭 |
| [inventory.md](inventory.md) | 6화면 UI 패턴 → Base UI 매핑 · 번들 비용 · 구현 함정 |
| [implementation-plan.md](implementation-plan.md) | 구현 순서(커밋 단위)와 검증 절차 |
| [../mockups/README.md](../mockups/README.md) | 화면 스펙의 출처와 한계 |

관련 결정 기록: [ADR 0006](../adr/0006-디자인-규범의-ssot를-프론트엔드-안에-둔다.md) (상태: **승인** — 2026-08-21 개정·승인)

## 현행 규범 요약

**현재 코드에 실제로 적용돼 있는 것만** 적는다. 제안은 [decisions.md](decisions.md)에 있다.

### 색 — 중립 + 액센트 (`theme.css`)

> 아래 표는 **화면 전반을 칠하는 기본 팔레트**다. 이것 말고 **분류 색** 계열이 둘 더 있다(업체 사례 `success` — [D12](decisions.md#d12-업체-사례-good-배지에-한해-상태-색-1건을-도입한다), 결제 유형 `payment-*` · 웨딩 카테고리 `category-*` — [D13](decisions.md#d13-결제-유형-배지에-카테고리-색-4종을-도입한다)·D17). 값과 대비는 `theme.css` 와 `/style-guide` 의 스와치가 SSOT 다 — 여기에 개수를 적어 두면 토큰이 늘 때마다 조용히 어긋난다.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-primary` | `#8B3F63` | 배지 · 주요 액션 · 강조 텍스트 · 진행률 채움 |
| `--color-primary-soft` | `#F1DEE7` | 배지 배경 등 옅은 면 |
| `--color-ink` | `#1D1B19` | 본문 · 헤드라인 |
| `--color-ink-soft` | `#726B65` | 보조 텍스트 · 캡션 · 비활성 라벨 |
| `--color-bg` | `#F7F6F4` | 페이지 배경 |
| `--color-surface` | `#FFFFFF` | 카드 등 표면 |
| `--color-line` | `#E7E3DE` | 카드 보더 · 구분선 · 진행률 트랙 |
| `--color-primary-hover` | `#77354F` | primary 버튼 hover/active 배경 **만** (D4 · 2026-08-21 적용). surface 대비 8.73 |

- **The One Accent Rule** — 베리 플럼은 배지 · 주요 버튼 · 강조 텍스트 · 진행률 채움에만. **배경 워시나 큰 면적 채우기로 쓰지 않는다.** 희소성이 곧 그 색의 힘이다. 「큰 면적」의 경계는 [D2](decisions.md#d2-primary-면-채움을-면적으로-등급-분리한다)가 정한다 — 카드 전면 채움은 **기각**(2026-08-22 종결).
- **The No-Pink-Cliché Rule** — "웨딩 = 밝은 핑크 + 세리프 + 그라디언트" 조합을 쓰지 않는다. 베리 플럼은 채도를 낮춘 와인 톤이지 밝은 핑크가 아니다.
  - ⚠️ **브랜드 마크는 이 규칙과 The One Accent Rule 의 대상이 아니다** → [D15](decisions.md#d15-브랜드-마크를-색-규범의-예외로-둔다). 로고(파스텔 핑크·블루)는 원색을 지키고, 억제는 색이 아니라 **크기 상한**으로 건다. 이 예외는 UI 를 칠하는 색에는 적용되지 않는다 — 아래 「브랜드 자산」 참고.
- **상태 색(성공 · 경고 · 위험)이 없다.** 지어내지 않는다 → [D6](decisions.md#d6-상태-색을-도입하지-않는다)
- **분류 색은 상태 색이 아니다.** 「무엇이 무엇인지」를 나눌 뿐 판단을 싣지 않으므로 D6 의 범위 밖이다 → D17. 데이터 성격에 따라 쓰는 법이 갈린다 — 순서 없는 명목형(웨딩 카테고리 9종)은 **서로 다른 색상**, 순서 있는 순서형(계약금→중도금→잔금)은 **한 색상의 명도 단계**. 한 줄에 배지가 둘 붙는 곳에서는 **형태**(카테고리=채움 · 결제 유형=테두리)가 계열을 가른다.
- ⚠️ **`--color-*: initial`은 임의값을 막지 못한다.** `bg-[#77354F]`는 그대로 컴파일된다 → [D8](decisions.md#d8-팔레트-밖-색-서술을-사실에-맞게-고치고-게이트로-강제한다)

### 형태

| 토큰 | 값 | 용도 |
|---|---|---|
| `--radius-sm` | `8px` | 배지 아닌 작은 컨트롤 · ghost 버튼 |
| `--radius-md` | `10px` | 버튼 · 입력 |
| `--radius-lg` | `16px` | 카드 (D1 · 2026-08-21 적용) |
| `--radius-pill` | `999px` | 배지 · 진행률 · 세그먼트 |

- **The Flat-By-Default Rule** — 그림자를 쓰지 않는다. 표면 구분은 **1px 헤어라인 보더**(`border-line`)로만. 호버도 그림자가 아니라 보더/배경의 옅은 변화로.
- **위 4단계가 전부다.** `--radius-*: initial` 로 Tailwind 기본 8단계를 **폐기**했다(2026-08-21). `rounded-2xl` 류는 생성되지 않는다(컴파일 실측). ⚠️ **`rounded-full`(∞px)과 `rounded-none`(0)은 `staticValues` 라 폐기와 무관하게 살아남는다** — `none` 은 토큰 밖 값이 아니고, `full` 은 빌드 게이트가 `border-radius` 값으로 잡는다. 원형은 `rounded-pill`. 이 사실은 폐기 계약 테스트가 처음 잡았다(그 전 실험 기록은 틀렸었다) → [D1](decisions.md#d1-라운드를-4단계로-고정한다)
- **그림자 토큰은 폐기됐다.** `--shadow-*` · `--drop-shadow-*` · `--inset-shadow-*` · `--text-shadow-*` 전부 `initial`(2026-08-21). 기본 22개가 생성되지 않는다 → [D10](decisions.md#d10-그림자-네임스페이스를-폐기하고-게이트를-파서로-다시-만든다)
- ⚠️ **`ring-*`는 어떤 네임스페이스 폐기로도 막히지 않는다**(컴파일 실측). 빌드 게이트가 커스텀 속성(`--tw-ring-*`)까지 봐서 잡는다 → [D9](decisions.md#d9-ring--를-금지어로-둔다) · [namespaces.md](namespaces.md)
- **폐기 상태는 빌드가 지킨다** — `theme.css` 에서 `initial` 줄이 하나라도 사라지면 게이트의 유지 검사가 빌드를 실패시킨다(적용 완료 · 주입 시험으로 확인)

### 서체

`--font-sans: "Wanted Sans Variable", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`

- **Wanted Sans Variable self-host** (OFL-1.1). `variable/split` 판 — `unicode-range` 92조각이라 쓰인 글자 조각만 전송된다
- 하나의 가변 폰트로 **무게만 바꿔 위계를 만든다**
- 금액은 항상 `tabular-nums` + 700 — `Money` 컴포넌트가 강제한다
- `preload`를 쓰지 않는다 · `@font-face` 메트릭 오버라이드를 넣지 않는다 (근거: `../architecture/toolchain.md` §8.2)

### 컴포넌트 스펙 (현행)

원 디자인 문서의 `components.*` 값을 코드가 옮긴 것. 코드 주석이 여기를 가리킨다.

| 컴포넌트 | 값 | 구현 |
|---|---|---|
| `badge-focus` | 모서리 `rounded-pill` · 12px 700 · **`whitespace-nowrap` + `shrink-0`** · 채움(기본): 배경 `primary-soft` 글자 `primary` / 테두리: 배경 `surface` + 1px `border-current` | `Badge` — 변이 **둘**(채움 · 테두리, D17). 형태는 계열을, 색은 값을 나타낸다. **잘리지 않는 짧은 라벨 전용** — 길이가 가변인 것은 배지에 담지 않는다([D16](decisions.md#d16-배지의-책임을-잘리지-않는-짧은-라벨로-좁힌다)) |
| 출처 목록 | 접힘 요약 한 줄(`min-h-tap` + 화살표) + 펼침 세로 목록 · 제목 `line-clamp-2` | `SourceList` — 채팅 인용 · 체크리스트 근거 · 업체사례 관련 사례의 공용 그릇([D16](decisions.md#d16-배지의-책임을-잘리지-않는-짧은-라벨로-좁힌다)) |
| `button-ghost` | 배경 투명 · 글자 `primary` · 모서리 `rounded-sm` · padding 5px 11px | `Button variant="ghost"` — 세로 5px 는 `min-h-tap`(44px)이 대신한다 |
| `button` primary / secondary | primary 면 + surface 글자 / surface 면 + line 보더 + ink 글자 · `rounded-md` | `Button` — 호버 **적용 완료**([D4](decisions.md#d4-호버-색을-77354f로-확정한다)): `enabled:hover:bg-primary-hover`. `enabled:` 를 붙여 비활성 상태에서 호버가 살아나지 않게 한다 |
| 진행률 | 트랙 `line` · 채움 `primary` · `rounded-pill` · 높이 8px | `Progress` — 불확정 표현은 [D11](decisions.md#d11-불확정-진행률의-시각-표현) |
| 카드 | `surface` 면 · 1px `line` 보더 · **`rounded-lg`(16px)** · padding 16px | `Card` — 라운드 16px **전환 완료**([D1](decisions.md#d1-라운드를-4단계로-고정한다)). 슬롯 2개: `title`(→ `<h2>`) · `subtitle`(→ `<p>` · `text-xs ink-soft`) |
| 날짜 입력 | ISO 마스크 입력(16px) + 44px 달력 버튼 · 아래 힌트 한 줄(`2027년 5월 15일 (토) · 259일 뒤`) · 펼침 캘린더는 6주 고정 42칸, 셀 44px · 선택 = primary 알약 · 오늘 = primary 테두리 · 주말 = **글자 무게** | `DateField` — `<input type="date">` 를 대체한다([D20](decisions.md#d20-날짜-입력을-네이티브-typedate-에서-자체-컴포넌트로-옮긴다)). 값은 언제나 ISO 문자열. 그리드(`DateCalendar`)는 첫 열림 때 받는 **별도 청크** |

### 브랜드 자산 (현행 — [D15](decisions.md#d15-브랜드-마크를-색-규범의-예외로-둔다))

| 항목 | 값 |
|---|---|
| 워드마크 | `src/shared/assets/merrymap-wordmark-96.png` (461×96 = **4.803:1**) — `logos/logo-text-3.png` 를 알파 bbox 로 크롭 후 축소한 파생본 |
| 심볼 | `src/shared/assets/merrymap-symbol-256.png` (256×254 = **1.0079:1**) — **파비콘과 같은 원본** `logos/favicon.png` 를 알파 bbox 로 크롭 → 232×230 축소 → **12px 균일 여백**을 둘러 구운 파생본 (2026-08-29 교체). 여백은 치수다 — 그림 높이 비중(90.55%)이 앞선 자산과 같아야 오버레이 마크 크기가 유지된다 |
| **함께 쓰지 않는다** | 워드마크가 이미 반지·하트 핀 모티프를 품고 있어 심볼을 곁들이면 모티프가 중복된다. **자리마다 하나만** |
| 구현 | `shared/ui/Brand.tsx` 하나(`variant="wordmark" \| "symbol"`). 셸은 `AppShell`, 셸 밖 화면은 `Page` 의 `brand` prop |
| 크기 | 사이드바 26 · 모바일 상단 바 22 · 로그인 32 · 온보딩 22 (전부 워드마크) / 생성 오버레이 56 (심볼) |
| 최소 크기 | **워드마크 18 · 심볼 24.** 벡터 원본이 없어 렌더러가 보정하지 못한다 |
| 접근성 | 워드마크 `alt="메리맵"`(유일한 브랜드 표기) · 심볼 `alt=""`(장식) · `width`/`height` 둘 다 명시(CLS) · **링크로 만들지 않는다**(`aria-current` 계약) |
| 파비콘 | `public/favicon.png`(96, 투명) · `public/apple-touch-icon.png`(180, **흰 배경 평탄화** + 여백 10%) — 원본 `logos/favicon.png`(1.007:1, 사실상 정사각). **심볼과 원본을 공유하지만 파일은 따로다**(굽는 여백·배치 경로가 다르다 — 자산 교체 시 **셋을 같이** 다시 구울 것). 자리표시 `favicon.svg` 는 **삭제**했다 |

### 범위 밖 (현행)

- **다크모드 없음** — 라이트 전용. 빌드 게이트가 `prefers-color-scheme` 을 산출 CSS 에서 막는다.
- **반투명 색 없음** — opacity modifier(`bg-surface/12`)는 `color-mix()` 의 srgb 폴백이 8자리 hex 로 접혀 **팔레트 게이트에 막힌다**(주입 시험). 수요가 0이라 열지 않았다 → [D7](decisions.md#d7-반투명은-토큰-없이-opacity-modifier로-쓴다). 요소 불투명도 `opacity-*` 는 색이 아니므로 무관하다.

### 타이포 · 접근성

| 역할 | 값 |
|---|---|
| 주 본문 | `text-base` 16px + `text-ink` |
| 보조 문구 | `text-sm` 14px + `text-ink-soft` |
| 캡션 · 라벨 | `text-xs` 12px + `text-ink-soft` |
| 입력 필드 | **16px 미만 금지** |
| 행간 (CJK) | 1.5~1.6 |
| 한국어 줄바꿈 | **어절 단위** — `body` 에 `word-break: keep-all` + `overflow-wrap: break-word` ([D19](decisions.md#d19-한국어-조판-규칙의-값과-범위를-함께-고친다--keep-all--break-word-본문-전체)) |
| 최소 터치 타겟 | 44px (`min-h-tap`) |

수치의 출처와 **근거 등급**은 [a11y.md](a11y.md). 요약하면 — **44px은 WCAG AA가 아니라 AAA다.**

⚠️ 줄바꿈 규칙의 두 값은 **짝이고 둘 다 필요하다.** `keep-all` 단독이면 어절보다 긴 문자열이 컨테이너를 밀어내고, `break-word` 대신 `overflow-wrap: anywhere` 를 쓰면 그 값이 `min-content` 계산에까지 끼어들어 **좁은 flex 자리에서 글자가 세로로 접힌다**(D19 가 고친 실제 결함이다). 호출부에서 이 짝을 다시 걸지 않는다 — `body` 에서 상속된다.

## 갱신 규칙

1. **값을 바꿀 때는 [decisions.md](decisions.md)를 먼저 고치고 `theme.css`를 맞춘다.** 반대로 하면 값의 출처가 코드가 되어 근거가 사라진다.
2. **「제안」과 「현행」 표시를 반드시 유지한다.** 적용되지 않은 것을 규범처럼 적지 않는다.
3. **구조로 강제했다고 쓰려면 위반을 주입해 실제로 막히는 것을 확인한 뒤에 쓴다.** 확인 전에는 "의도"라고 쓴다.
4. 외부 기술 문서를 인용할 때는 **URL과 확인 등급**(1차 공식 / 2차 자료 / 미확인)을 함께 적는다.
5. 새 문서는 이 색인과 [../README.md](../README.md)에 추가한다.
