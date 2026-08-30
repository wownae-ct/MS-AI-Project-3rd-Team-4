// 브레드크럼브 — 「지금 어디인가」를 계층으로 말하고, 조상으로 올라가는 길을 준다.
//
// ## 왜 히스토리 뒤로가기가 아닌가
//
// 이 장치가 답하는 질문은 **"어디에 있는가"** 이지 "어디서 왔는가"가 아니다. 그래서 북마크·새로고침·
// 주소 직접 입력으로 들어와 히스토리가 비어 있어도 **똑같이 동작한다** — 계층은 진입 경로와 무관하다.
// 히스토리를 쓰는 쪽은 `BackLink` 이고 그건 부모가 없는 화면(설정·스타일가이드) 몫이다. 두 장치는
// 뜻이 달라서 한 화면에 함께 나가지 않는다.
//
// ## 지금 유일한 사용처는 `/category/$id` 다
//
// 앱의 다른 화면은 전부 최상위 탭이라 조상이 없다. 탭 화면에 「홈 › 예산」을 다는 것은 **거짓 계층**이고
// (예산은 홈의 자식이 아니다) `aria-current` 가 이미 주는 정보를 반복한다.
// `/category/$id` 만이 진짜 하위 화면이다 — docs/design/layout.md §1 이 그것을 계약으로 적었다:
// *"카테고리 상세는 독립 탭이 아니라 홈 탭에 귀속되는 하위 화면이다."* 이 컴포넌트는 그 계약을
// 처음으로 **화면에** 드러낸다(그전까지 그 사실을 아는 것은 `NavItem` 의 활성 판정뿐이었다).
//
// ## 마크업 — ARIA APG Breadcrumb
//
//   <nav aria-label="현재 위치"><ol> … <span aria-current="page">
//
// 마지막 항목이 링크가 아니고 `aria-current="page"` 를 지는 것이 이 패턴의 핵심이다
// (https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/ — 1차).
// **그 불변식을 타입으로 강제한다** — `ancestors`(링크)와 `current`(텍스트)를 아예 다른 prop 으로
// 받는다. 배열 하나로 받고 "마지막 원소는 링크가 아니다"를 런타임 인덱스 비교로 지키면, 호출부가
// 조상만 넘긴 순간 조용히 조상이 현재 화면으로 렌더된다.
//
// 🚨 **`aria-current` 가 문서 안에 2개가 된다 — 그리고 그것이 옳다.**
// docs/design/layout.md §5 의 계약 원문은 *"집합 내 오직 하나"* 이고 MDN 도 같다. 주 메뉴와
// 브레드크럼브는 **다른 집합**이라 각각 하나씩 갖는 것이 정상이다. `app/ui/AppShell.test.tsx` 가
// 오래 `document.querySelectorAll` 로 세어 온 것은 집합이 하나뿐이던 시절의 축약이었고, 이 파일이
// 두 번째 집합을 만들면서 그 축약을 집합별 검사로 정정했다(D25).
import { Link } from "@tanstack/react-router";
import { PAGE_NAV_CONTROL, PAGE_NAV_SEPARATOR } from "./page-nav-style";

/**
 * 조상으로 쓸 수 있는 경로. 라우터에 등록된 것만 허용된다 — 오타는 `tsc -b` 가 잡는다
 * (`app/ui/NavItem.tsx` 의 `NavTarget` 과 같은 방식).
 *
 * 지금 필요한 조상은 `/` 하나뿐이라 그것만 연다 — 쓸 곳이 확정되지 않은 것을 미리 만들지 않는다
 * (ADR 0004). 두 단계짜리 계층이 실제로 생기면 그때 여기에 더한다.
 */
export type BreadcrumbTarget = "/";

export interface BreadcrumbAncestor {
  label: string;
  to: BreadcrumbTarget;
}

export interface BreadcrumbProps {
  /** 조상 — 순서대로 링크가 된다. 비어 있으면 이 컴포넌트를 쓸 이유가 없다. */
  ancestors: readonly BreadcrumbAncestor[];
  /** 현재 화면의 이름. 링크가 아니고 `aria-current="page"` 를 진다 — 보통 `Page` 의 `title` 과 같은 값이다. */
  current: string;
}

export function Breadcrumb({ ancestors, current }: BreadcrumbProps) {
  return (
    // `<nav>` 가 이제 화면에 3개다(주 메뉴 · 보조 메뉴 · 현재 위치) — APG 는 **각각 고유 라벨**만
    // 요구하고 개수를 제한하지 않는다. 라벨을 "브레드크럼브"가 아니라 「현재 위치」로 두는 것은
    // 이 저장소가 화면에 외래어 UI 용어를 내지 않기 때문이다(탭바 라벨과 같은 기준).
    <nav aria-label="현재 위치">
      <ol className="flex min-w-0 items-center gap-1.5">
        {ancestors.map((ancestor) => (
          <li key={ancestor.to} className="flex shrink-0 items-center gap-1.5">
            {/* 🚨 `activeOptions={{ exact: true }}` 가 **없으면 조용히 틀린다.** TanStack 의 `Link` 는
                기본이 접두사 매칭이라 `to="/"` 가 **모든 경로에 걸려** 스스로 `aria-current="page"` 를
                붙인다(props 로 덮을 수 없다 — `app/ui/AppShell.tsx` 의 `MobileSettingsLink` 주석에
                실측 근거). 그러면 이 링크가 「현재 위치」로 읽히고 브레드크럼브 자체가 거짓말이 된다.
                화면에는 아무 변화가 없다 — `Breadcrumb.test.tsx` 가 이것을 계약으로 고정한다. */}
            <Link to={ancestor.to} activeOptions={{ exact: true }} className={PAGE_NAV_CONTROL}>
              {ancestor.label}
            </Link>
            <span aria-hidden="true" className={PAGE_NAV_SEPARATOR}>
              ›
            </span>
          </li>
        ))}

        {/* `min-w-0` + `truncate` — 320px 기기에서 긴 카테고리 이름이 컨테이너 밖으로 삐져나가던
            사고를 되풀이하지 않는다(pages/dashboard/ui/CategoryRow.tsx 가 같은 수정을 받았다).
            조상 쪽 `shrink-0` 과 짝이다: 좁아질 때 줄어드는 것은 현재 화면 이름이어야 한다 —
            조상이 줄면 올라가는 길 자체가 눌린다. */}
        <li className="flex min-w-0 items-center">
          <span aria-current="page" className="truncate text-sm font-bold text-ink">
            {current}
          </span>
        </li>
      </ol>
    </nav>
  );
}
