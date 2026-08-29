// 앱 셸 — 내비게이션이 붙는 화면들의 공통 레이아웃 (docs/design/layout.md §1·§4·§5).
//
// 셸 조건은 화면 스펙이 코드로 준 계약이다:
//   showSidebar = showTabBar 의 반대 = !mobile · **온보딩은 셸 자체가 없다**
// 온보딩을 여기서 분기로 걸러내지 않는다 — 라우트 트리에서 이 레이아웃 **밖**에 두는 것으로 표현한다.
// 조건문이 아니라 구조로 만들어야 새 화면이 늘어도 규칙이 흩어지지 않는다.
//
// ## 단일 DOM + CSS 재배치 (layout.md §5)
//
// 모바일 하단 탭바와 데스크톱 좌측 사이드바는 **같은 DOM**이고 CSS 로 자리만 바꾼다.
// DOM 을 이중으로 두면 ① 중복 랜드마크가 스크린리더의 목록을 어지럽히고
// ② 숨기는 쪽을 `display:none` 으로 하지 않으면 **키보드 포커스가 보이지 않는 내비로 들어간다**
// (`aria-hidden="true"` 만으로는 막지 못한다).
// 보조 메뉴가 모바일에서 `hidden`(→ `display:none`)인 것도 같은 이유다 — 포커스가 들어가지 않는다.
//
// `<nav>` 가 2개이므로 **각각 고유 `aria-label`** 이 필수다(ARIA APG). `role="tablist"` 는 쓰지 않는다 —
// 탭 위젯은 같은 페이지 안 패널 전환용이고 이건 URL 이 바뀌는 라우트 내비게이션이다.
//
// ## 브랜드 — layout.md §4 가 예약해 둔 슬롯을 채웠다 (2026-08-28)
//
// §4 의 사이드바 순서는 「**브랜드** → 주 내비 → 구분선 → 보조 링크 → 하단 블록」이고, 그중 브랜드는
// *"제품명 표기는 디자인 오너 대기"* 로 오래 비어 있었다. 로고가 도착해 그 대기가 닫혔다(decisions.md D15).
// 모바일에도 같은 이유로 하나 더 둔다 — 상단 바 우측에 설정(⚙️) 하나뿐이라 **좌측이 통째로 비어
// 있었다.** 브랜드가 그 자리를 쓰므로 밀려나는 요소가 없고, 바 높이는 `MobileSettingsLink` 의
// `min-h-tap`(44px)이 계속 결정한다 — 22px 워드마크는 그 안에 들어간다(= `shared/ui/shell-metrics.ts`
// 의 산술이 그대로다).
//
// 🚨 **브랜드를 `<Link to="/">` 로 만들지 않는다.** 로고 클릭 → 홈이 웹 관례이긴 하지만, TanStack 의
// `Link` 는 활성일 때 `aria-current="page"` 를 붙이고 그건 props 로 못 덮는다(아래 `MobileSettingsLink`
// 주석에 실측 근거). 대시보드에서 홈 항목과 함께 **2개**가 되어 AppShell.test.tsx 의 *"정확히 하나"*
// 계약이 깨진다. 바로 아래에 홈 탭이 있으므로 비인터랙티브로 둬도 사용자가 잃는 경로가 없다.
// `<nav>` **밖**에 두는 것도 같은 종류의 이유다 — 랜드마크 2개·주 메뉴 5개 계약을 건드리지 않는다.
//
// ## 아직 만들지 않은 것 — 지어내지 않는다
//
// layout.md §4 의 사이드바 **하단 블록**, 데스크톱 **상단바**(제목·D-Day·주요 액션)는 여기 없다.
// 하단 블록은 layout.md §4 가 "구현 전 결정 필요"로 열어 둔 항목이다(아바타가 계정 UI 로 읽히는데
// 로그인 개념이 확인되지 않았다).
// 상단바로 제목을 옮기는 것(`showPageTitle = mobile`)은 화면 내용이 들어올 때 `Page` 와 함께 다룬다.
// 쓸 곳이 확정되지 않은 것을 미리 만들지 않는다(ADR 0004).
import { Link, Outlet } from "@tanstack/react-router";
import {
  Brand,
  IconCalendar,
  IconChart,
  IconChat,
  IconHome,
  IconInfo,
  IconSettings,
  IconWallet,
  SHELL_BOTTOM_INSET,
  SHELL_TOP_INSET,
} from "@/shared/ui";
import { NavItem, type NavItemProps } from "./NavItem";

/**
 * 주 내비 5개 — layout.md §3의 4개(홈·타임라인·예산·리포트)에 2026-08-24 "AI상담"을 추가했다.
 * 근거는 layout.md가 아니라 docs/wedding/plan/new/12_final_prototype_mockup.html의 실제 탭바
 * (renderApp())다 — 그 파일이 이 4개 뒤에 AI상담을 마지막으로 둔 순서를 그대로 따른다.
 *
 * 홈은 `/category/…` 에서도 활성이어야 한다 — 카테고리 상세는 독립 탭이 아니라 홈에 귀속되는
 * 하위 화면이다(layout.md §1). 그 규칙의 소재지는 `NavItem` 한 곳이다.
 */
const PRIMARY_NAV: readonly NavItemProps[] = [
  { to: "/", label: "홈", icon: <IconHome />, alsoActiveFor: ["/category"] },
  { to: "/timeline", label: "타임라인", icon: <IconCalendar /> },
  { to: "/budget", label: "예산", icon: <IconWallet /> },
  { to: "/report", label: "리포트", icon: <IconChart /> },
  { to: "/chat", label: "AI상담", icon: <IconChat /> },
];

/** 보조 내비 — 데스크톱 사이드바에만 나온다(layout.md §4: 주 내비 → 구분선 → 보조 링크). */
const SECONDARY_NAV: readonly NavItemProps[] = [
  { to: "/style-guide", label: "스타일가이드", icon: <IconInfo /> },
  { to: "/settings", label: "설정", icon: <IconSettings /> },
];

// 두 고정바가 콘텐츠에서 예약해 가는 높이 — **값은 여기 없다.** `shared/ui/shell-metrics.ts` 가
// 단일 출처이고 그 머리말에 산술이 있다.
//
// 🚨 [2026-08-29] 종전엔 이 자리에 **고정 96px** 짜리 패딩 상수 둘이 있었고, 주석이
// *"Dynamic Island 기종의 safe-area-inset-top이 기종마다 꽤 벌어져 있어 정밀하게 깎기보다
// 안전 마진을 우선한다"* 며 그 값을 정당화했다. **산술이 맞지 않았다** — 상단 바 실높이는
// `0.5rem + env(top) + min-h-tap + 1px` 이라 노치 기종에서 100px, 다이내믹 아일랜드에서 112px 가
// 되는데 예약은 늘 96px 이었다. 그래서 **노치 있는 아이폰에서만** 페이지 제목이 바 밑으로
// 잘렸다(사용자 리포트 2026-08-29). 고정 상수로는 기종별 편차를 덮을 수 없다 — 예약분이
// `env()` 를 그대로 품어야 한다.
//
// 같은 주석이 *"`shared/ui/Page.tsx`의 `fill` 컨테이너 계산식도 이 값이 바뀌면 같이 바꿀 것"*
// 이라고 경고해 뒀는데 지켜지지 않아 세 값이 어긋나 있었다. 이제 셋 다 그 모듈에서 나온다.

// safe-area 는 **2단계 세트**다 — `index.html` 의 `viewport-fit=cover` 가 없으면 `env()` 는 항상 0 이다
// (layout.md §3.2). 임의값 안의 `_` 는 Tailwind 가 공백으로 바꾼다 — CSS `calc` 는 `+` 양옆 공백이 필수라
// 언더스코어 없이 쓰면 선언 자체가 무효가 된다.
const TAB_BAR_SAFE_AREA = "pb-[calc(0.5rem_+_env(safe-area-inset-bottom))] md:pb-0";
const TOP_BAR_SAFE_AREA = "pt-[calc(0.5rem_+_env(safe-area-inset-top))] md:pt-0";

// [2026-08-27, docs/wedding/refactor/bug-todo.md [결정됨] "유저 설정 화면 신규 추가"] 로그아웃은
// 더 이상 AppShell이 직접 갖지 않는다 — `pages/settings/ui/SettingsPage.tsx`로 옮겼다. 이 자리엔
// 그 화면으로 가는 톱니바퀴 진입점만 남는다(사용자 지시: "로그아웃 자리에 톱니바퀴를 놓고 그
// 안에 로그아웃 기능을 옮기면"). 데스크톱은 위 `SECONDARY_NAV`의 일반 `NavItem` 항목이 이미
// 그 역할을 한다 — 별도 컴포넌트가 필요한 건 모바일 쪽뿐이다.

// [2026-08-27] 모바일에는 이 진입점(로그아웃 → 지금은 설정)에 들어갈 방법이 아예 없었다 —
// 데스크톱 전용 사이드바 안에만 있었다(실사용자 리포트로 확인된 실제 갭). 모바일 탭바는
// 12_final_prototype_mockup.html이 못박은 5개(홈·타임라인·예산·리포트·AI상담) 자리라 6번째
// 항목을 끼워 넣을 수 없어서, 화면 상단에 별도로 얇은 바를 하나 더 둔다 — 어느 탭에서 봐도
// 항상 우상단에 톱니바퀴가 있다.
//
// `<nav>`/`<header>`로 감싸지 않는다 — 링크 하나뿐이라 목록형 내비게이션 랜드마크로 보기
// 어렵고, `<header>`로 감싸면 각 `Page`가 이미 내는 `<header>`(배너 랜드마크)와 겹쳐 랜드마크가
// 중복된다(AppShell.test.tsx가 내비 2개·고유 라벨을 계약으로 고정한 것과 같은 이유).
//
// ⚠️ **`/settings`는 "정확히 하나의 aria-current" 테스트 대상에서 일부러 뺀다**
// (AppShell.test.tsx 참고). `<Link>`가 활성일 때 붙이는 `aria-current="page"`는 props로 못
// 덮어쓴다(node_modules/@tanstack/react-router/dist/esm/link.js — `...isActive && STATIC_ACTIVE_PROPS`
// 가 스프레드 맨 뒤라 항상 이긴다, 확인함) — 그래서 이 링크와 `SECONDARY_NAV`의 `/settings`
// 항목이 **둘 다** 진짜 `<Link>`인 이상, `/settings`에 있을 때 DOM에는 항상 `aria-current="page"`
// 가 2개 존재한다. 실브라우저에서는 한쪽이 항상 `display:none`(md:hidden ↔ hidden md:block)
// 이라 접근성 트리에서 완전히 빠져 실사용자는 절대 2개를 동시에 못 본다 — 하지만 jsdom은
// 미디어쿼리를 평가하지 않아 `document.querySelectorAll('[aria-current="page"]')`가 그대로 2개를
// 센다. 다른 5개 라우트(PRIMARY_NAV)는 이 문제가 없다 — 그쪽은 항목을 한 번만 렌더하고
// CSS가 그 컨테이너 하나만 재배치할 뿐, 진짜로 두 번 렌더하지 않는다.
function MobileSettingsLink() {
  return (
    <Link
      to="/settings"
      className="min-h-tap inline-flex items-center gap-1 rounded-sm px-3 text-sm font-bold text-ink-soft transition-colors duration-150 hover:bg-bg hover:text-primary md:hidden"
    >
      <IconSettings />
      <span>설정</span>
    </Link>
  );
}

export function AppShell() {
  return (
    <div className="mx-auto flex w-full max-w-[1160px] flex-col md:flex-row">
      <div
        className={
          "fixed inset-x-0 top-0 z-20 flex items-center justify-between border-b border-line bg-surface px-4 " +
          TOP_BAR_SAFE_AREA +
          " md:hidden"
        }
      >
        <Brand size={22} />
        <MobileSettingsLink />
      </div>

      <div
        className={
          "fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pt-1 " +
          TAB_BAR_SAFE_AREA +
          " md:static md:w-[232px] md:shrink-0 md:self-stretch md:border-t-0 md:border-r md:pt-0"
        }
      >
        {/* 사이드바 전용 — 모바일에서는 위 상단 바가 같은 역할을 한다. 컨테이너의 `md:pt-6` 를
            이 블록의 `md:pt-6` 가 대신하므로(위에서 `md:pt-0` 로 바꿨다) 내비 위 여백이 이중이 되지 않는다. */}
        {/* 워드마크 26px → 폭 125px. 사이드바 안쪽 폭은 232 − 24(md:px-3) = 208px 라 여유가 있다. */}
        <div className="hidden md:mb-4 md:flex md:items-center md:px-3 md:pt-6">
          <Brand size={26} />
        </div>

        <nav aria-label="주 메뉴">
          <ul className="flex md:flex-col md:gap-1 md:px-3">
            {PRIMARY_NAV.map((item) => (
              <li key={item.to} className="flex flex-1 md:flex-none">
                <NavItem {...item} />
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="보조 메뉴" className="hidden md:mt-4 md:block md:border-t md:border-line md:pt-4">
          <ul className="md:flex md:flex-col md:gap-1 md:px-3">
            {SECONDARY_NAV.map((item) => (
              <li key={item.to} className="flex">
                <NavItem {...item} />
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className={`min-w-0 flex-1 ${SHELL_TOP_INSET} ${SHELL_BOTTOM_INSET}`}>
        <Outlet />
      </div>
    </div>
  );
}
