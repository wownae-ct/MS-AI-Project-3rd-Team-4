// 내비게이션 항목 — 탭바와 사이드바가 **같은 컴포넌트**를 쓴다.
//
// 활성 판정 계약을 여기 한 곳에 모은다 (docs/design/layout.md §1):
//   tabHome active = (screen === 'dashboard' || screen === 'category')
// `/category/$id` 는 독립 탭이 아니라 **홈 탭에 귀속되는 하위 화면**이다. 이 규칙이 두 곳에 흩어지면
// 탭바와 사이드바의 활성 표시가 조용히 갈린다.
//
// 접근성 (layout.md §5)
//   · `aria-current="page"` 는 **집합 안에 정확히 하나**여야 한다.
//     TanStack 의 <Link> 는 자기 `to` 가 활성일 때 자동으로 붙인다(설치본 dist/esm/link.js 확인).
//     그래서 `activeOptions={{ exact: true }}` 를 **모든 항목에** 준다 — 접두사 매칭을 켜면 `to="/"` 가
//     모든 경로에 걸려 aria-current 가 여러 개 생긴다.
//   · 홈 탭이 `/category/…` 에서도 활성이어야 하는 몫만 우리가 직접 얹는다. 그 경우 Link 는 자기 판정으로
//     붙이지 않으므로 겹치지 않는다.
//   · `role="tablist"` 를 쓰지 않는다 — 탭 위젯은 같은 페이지 안 패널 전환용이고, 이건 URL 이 바뀌는
//     라우트 내비게이션이다.
//
// `hover:` 에 `enabled:` 를 붙이지 않는다 — `:enabled` 는 폼 컨트롤에만 매치되고 <a> 에는 걸리지 않는다.
// (Button 은 <button> 이라 `enabled:` 가 맞다. 같은 접두사를 기계적으로 복사하지 말 것.)
import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";

/** 내비에 노출하는 경로. 라우터에 등록된 것만 허용된다 — 오타는 `tsc -b` 가 잡는다. */
export type NavTarget = "/" | "/timeline" | "/budget" | "/report" | "/chat" | "/style-guide" | "/settings";

export interface NavItemProps {
  to: NavTarget;
  label: string;
  icon: ReactNode;
  /** 이 항목이 활성으로 보여야 하는 **추가** 경로 접두사 (홈 탭의 `/category`). */
  alsoActiveFor?: readonly string[];
}

// 🚨 [2026-08-29, 320px 전수 검사] 모바일 가로 패딩이 `px-2` 였다 — **여유가 정확히 0px 이었다.**
//
// 하단 탭바는 화면 폭을 5칸으로 나눈다. 320px 기기에서 한 칸은 64px 이고, 그 칸이 더 줄 수 없는
// 하한(`min-width: auto` = min-content)은 이렇게 나온다:
//
//   라벨 「타임라인」 = 4음절 × `text-xs`(12px) = 48px  +  `px-2` 16px  =  **64px**
//   → 5 × 64 = 320px = 뷰포트와 **동일**
//
// 라벨이 이보다 더 못 줄어드는 이유는 조판 규칙이다 — `keep-all`(D19)이 음절 사이 줄바꿈을 막고,
// 짝인 `overflow-wrap: break-word` 는 **min-content 계산에 들어가지 않는다**(CSS Text L3). 즉
// 「타/임/라/인」으로 접혀서 폭을 내주는 일은 (다행히) 일어나지 않고, 대신 **한 칸이라도 넘치면
// 5번째 탭(AI상담)이 뷰포트 밖으로 밀려 잘린다.** 고정 요소라 가로 스크롤도 생기지 않는다 —
// 조용히 사라진다.
//
// 「정확히 맞으니 괜찮다」로 두지 않는 이유: 이 산술은 **한글 자간이 정확히 1em 이라는 한 폰트의
// 메트릭**에 기대고 있고, iOS 는 Wanted Sans 가 도착하기 전 폴백(Apple SD Gothic Neo)으로 먼저
// 레이아웃한다(`font-display: swap`). 같은 함정을 `pages/report/ui/CompletionRow.tsx` 가 이미 한 번
// 밟았다(그 파일 주석 — 「3.4px 여유」에 기대던 `w-20`).
//
// `px-1` 로 낮추면 칸당 하한이 56px 이 되어 5 × 56 = 280px, **40px 여유**가 생긴다. 잃는 것은 없다 —
// 이 패딩은 배경이 없는 항목의 좌우 여백이라 시각적으로 하는 일이 없고, 항목은 어차피
// `items-center` 로 가운데 정렬된다. 터치 타겟도 그대로다(칸 폭 64px 은 `flex-1` 이 정하고
// 세로는 `min-h-tap`). 데스크톱 사이드바는 `md:px-3` 이 이미 덮으므로 영향받지 않는다.
const BASE =
  "flex min-h-tap flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-sm " +
  "px-1 py-1 text-xs font-bold text-ink-soft transition-[background-color,color] duration-150 " +
  "hover:bg-bg md:w-full md:flex-none md:flex-row md:justify-start md:gap-3 md:px-3 md:py-2 md:text-sm";

/** 활성 — 배경 없이 색으로만. The One Accent Rule: 넓은 면을 primary 로 채우지 않는다. */
const ACTIVE = "text-primary";

export function NavItem({ to, label, icon, alsoActiveFor }: NavItemProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeByPrefix = alsoActiveFor?.some((prefix) => pathname.startsWith(prefix)) ?? false;

  return (
    <Link
      to={to}
      className={activeByPrefix ? `${BASE} ${ACTIVE}` : BASE}
      // activeProps 의 className 은 base 를 **대체하지 않고 이어 붙인다**(설치본 link.js 의 resolvedClassName).
      // 그래서 여기엔 활성 조각만 준다 — BASE 를 다시 적으면 클래스가 중복된다.
      activeProps={{ className: ACTIVE }}
      activeOptions={{ exact: true }}
      // Link 는 자기 판정이 활성일 때 aria-current="page" 를 **마지막에 스프레드**한다.
      // 여기서 주는 값은 비활성일 때만 살아남으므로 홈 탭의 `/category/…` 몫만 얹힌다 — 겹치지 않는다.
      aria-current={activeByPrefix ? "page" : undefined}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
