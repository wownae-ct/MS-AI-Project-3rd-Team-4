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
// ## 아직 만들지 않은 것 — 지어내지 않는다
//
// layout.md §4 의 사이드바 **브랜드**·**하단 블록**, 데스크톱 **상단바**(제목·D-Day·주요 액션)는
// 여기 없다. 하단 블록은 layout.md §4 가 "구현 전 결정 필요"로 열어 둔 항목이고(아바타가 계정 UI 로
// 읽히는데 로그인 개념이 확인되지 않았다), 제품명 표기는 CLAUDE.md §6-G 가 디자인 오너 대기다.
// 상단바로 제목을 옮기는 것(`showPageTitle = mobile`)은 화면 내용이 들어올 때 `Page` 와 함께 다룬다.
// 쓸 곳이 확정되지 않은 것을 미리 만들지 않는다(ADR 0004).
import { Outlet, useNavigate } from "@tanstack/react-router";
import { invalidateSession, logout } from "@/entities/session";
import { IconCalendar, IconChart, IconChat, IconHome, IconInfo, IconWallet } from "@/shared/ui";
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
];

// 모바일에서 탭바는 `fixed` 라 문서 흐름에서 빠진다 — 콘텐츠 하단에 그만큼 여백이 없으면
// 마지막 요소가 탭바에 가린다. 탭 높이(min-h-tap 44px) + 상하 패딩 + safe-area 를 덮는 값이다.
const CONTENT_BOTTOM_INSET = "pb-24 md:pb-0";

// safe-area 는 **2단계 세트**다 — `index.html` 의 `viewport-fit=cover` 가 없으면 `env()` 는 항상 0 이다
// (layout.md §3.2). 임의값 안의 `_` 는 Tailwind 가 공백으로 바꾼다 — CSS `calc` 는 `+` 양옆 공백이 필수라
// 언더스코어 없이 쓰면 선언 자체가 무효가 된다.
const TAB_BAR_SAFE_AREA = "pb-[calc(0.5rem_+_env(safe-area-inset-bottom))] md:pb-0";

// 로그아웃은 §"아직 만들지 않은 것" 이 열어 둔 사이드바 하단 블록(아바타/계정 UI)의 축소판이다 —
// 그 전체 디자인은 여전히 오너 대기 상태라 지어내지 않고, 보조 메뉴와 같은 desktop-only 자리에
// 텍스트 버튼 하나만 둔다. 모바일 탭바는 12_final_prototype_mockup.html 이 못박은 5개(홈·타임라인·
// 예산·리포트·AI상담) 자리라 6번째 항목을 끼워 넣지 않는다 — 모바일에서 로그아웃할 방법이 없는 건
// 실제 갭이지만, 이번 로컬 E2E 검증 범위에서는 데스크톱 브라우저로 충분하다.
function LogoutButton() {
  const navigate = useNavigate();
  async function handleLogout() {
    await logout();
    invalidateSession();
    await navigate({ to: "/login", search: { redirect: undefined, oauth_error: undefined } });
  }
  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      className="min-h-tap w-full rounded-sm px-3 py-2 text-left text-sm font-bold text-ink-soft transition-colors duration-150 hover:bg-bg hover:text-primary"
    >
      로그아웃
    </button>
  );
}

export function AppShell() {
  return (
    <div className="mx-auto flex w-full max-w-[1160px] flex-col md:flex-row">
      <div
        className={
          "fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pt-1 " +
          TAB_BAR_SAFE_AREA +
          " md:static md:w-[232px] md:shrink-0 md:self-stretch md:border-t-0 md:border-r md:pt-6"
        }
      >
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
            <li className="flex">
              <LogoutButton />
            </li>
          </ul>
        </nav>
      </div>

      <div className={`min-w-0 flex-1 ${CONTENT_BOTTOM_INSET}`}>
        <Outlet />
      </div>
    </div>
  );
}
