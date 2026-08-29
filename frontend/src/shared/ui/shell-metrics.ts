// 모바일 고정바가 콘텐츠에서 예약해 가는 높이 — **한 산술의 단일 출처다.**
//
// ## 왜 파일이 따로 있나 (2026-08-29)
//
// 이 값들은 원래 `app/ui/AppShell.tsx` 에 고정 96px 짜리 패딩 유틸리티 2개로, `shared/ui/Page.tsx`
// 에 그 둘의 합(192px)을 뷰포트 높이에서 빼는 리터럴 1개로 흩어져 있었다. Page.tsx 주석이
// *"AppShell 의 값이 바뀌면 이쪽 계산식도 같이 바꿀 것"* 이라고 경고해 두었지만 **경고만으로는
// 지켜지지 않았다** — 세 값이 실제로 어긋나 있었다(아래 §산술). 두 파일이 서로를 import 할 수
// 없으므로(`shared` 는 `app` 을 못 본다 — docs/architecture/layers.md) 공유 지점은 `shared` 뿐이다.
//
// ⚠️ 이 주석에 **옛 유틸리티 이름을 평문으로 적지 않는다.** Tailwind 는 소스를 파싱하지 않고
// 평문으로 훑으므로 주석 속 클래스명 하나가 그대로 산출 CSS 를 만든다 — 실제로 이 파일의 첫
// 판이 옛 이름을 적었다가 쓰지도 않는 규칙 2개를 CSS 에 실었다(BudgetDonut.tsx · NumberInput.tsx
// 머리말이 기록해 둔 그 함정이다).
//
// 컴포넌트가 아니라 **문자열 상수**만 있는 모듈이다. CSS 사이드이펙트가 없어 배럴로 재수출해도
// 안전하다(styles.css 를 재수출하지 못하는 것과 다르다).
//
// ## 산술 — 예약분은 실제 바 높이에서 나온다
//
//   상단 바 (AppShell)   pt-[0.5rem + env(top)] + min-h-tap(2.75rem) + border-b 1px
//                        = 53px + env(top)          → 예약 3.5rem(56px)  + env(top)   여유 3px
//   하단 탭바 (AppShell) border-t 1px + pt-1(0.25rem) + min-h-tap(2.75rem) + pb-[0.5rem + env(bottom)]
//                        = 57px + env(bottom)       → 예약 3.75rem(60px) + env(bottom) 여유 3px
//   fill 컨테이너 (Page) 100dvh − (위 둘의 합 7.25rem + 두 env)
//
// 🚨 **왜 `env()` 를 예약분에도 넣어야 하나 — 아이폰 전용 결함의 실제 원인이었다.**
// 종전 예약분은 위아래 다 **고정 96px** 이었다. `env(safe-area-inset-top)` 은 아이폰 기종마다
// 크게 갈린다 — SE(노치 없음) 0px · 노치 기종 47px · 다이내믹 아일랜드 59px. 그래서 상단 바
// 실높이가 53 / 100 / 112px 이 되는데 예약은 늘 96px 이라, **노치가 있는 아이폰에서만** 페이지
// 제목이 고정바 밑으로 4~16px 잘렸다. SE·데스크톱·안드로이드에서는 재현되지 않아 "아이폰에서만
// UI 가 망가진다"로 보였다. 고정 상수로는 이 편차를 덮을 수 없다 — 예약분이 `env()` 를 그대로
// 품어야 한다.
//
// ⚠️ **완성된 리터럴로만 적는다.** Tailwind 는 소스를 평문으로 스캔하므로 런타임 조립(`calc(${n})`)은
// 찾지 못하고 **빌드는 성공한 채 스타일만 사라진다**(CLAUDE.md §5.1). 아래 세 문자열은 실제
// theme.css 로 컴파일해 규칙 생성을 확인했다.
//
// ⚠️ 임의값 안의 `_` 는 Tailwind 가 공백으로 바꾼다 — CSS `calc` 는 `+`/`-` 양옆 공백이 필수라
// 언더스코어 없이 쓰면 선언 자체가 무효가 된다. `AppShell` 의 safe-area 상수들이 쓰던 형식 그대로다.
//
// ⚠️ safe-area 는 **2단계 세트**다 — `index.html` 의 `viewport-fit=cover` 가 없으면 `env()` 는
// 항상 0 이다(docs/design/layout.md §3.2). 그 메타 태그를 지우면 이 파일이 통째로 무력해진다.
//
// 데스크톱(`md:`)에서는 두 바가 각각 `md:hidden` / `md:static` 으로 바뀌어 콘텐츠를 가리지 않으므로
// 예약이 0 이다. 그래서 아래 두 상수는 `md:` 변이를 함께 들고 다닌다.

/** 모바일 상단 바가 가리는 높이. `AppShell` 의 콘텐츠 열이 `padding-top` 으로 예약한다. */
export const SHELL_TOP_INSET = "pt-[calc(3.5rem_+_env(safe-area-inset-top))] md:pt-0";

/** 모바일 하단 탭바가 가리는 높이. `AppShell` 의 콘텐츠 열이 `padding-bottom` 으로 예약한다. */
export const SHELL_BOTTOM_INSET = "pb-[calc(3.75rem_+_env(safe-area-inset-bottom))] md:pb-0";

/**
 * `Page fill` 컨테이너의 높이 — 뷰포트에서 위 두 예약분을 뺀 나머지.
 *
 * `dvh` 는 조상의 padding 을 전혀 모르므로, 높이를 뷰포트 단위로 먼저 고정하는 `fill` 화면은
 * 두 바의 몫을 **여기서 다시** 빼야 헤더가 상단 바에, 입력행이 하단 탭바에 가려지지 않는다.
 * 7.25rem = 3.5rem + 3.75rem — 위 두 상수와 같은 산술에서 나온다.
 */
export const SHELL_FILL_HEIGHT =
  "h-[calc(100dvh_-_7.25rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] md:h-dvh";
