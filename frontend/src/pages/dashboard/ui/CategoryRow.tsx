// 카테고리별 체크리스트 진행률 한 줄 (UX 개편, 2026-08-26 — 예산 지불률 표시를 이 자리에서
// 걷어냈다. 예산 상세는 이제 예산 페이지가 전담한다). 원래 시각 스펙:
// docs/mockups/s2-dashboard.html:219-284 — 그 목업이 그리던 "예산 지불률" 축을 이 화면에서는
// 더 이상 쓰지 않는다(ADR 0006 — 규범/요구사항 변경이 목업을 이긴다).
//
// **체크리스트 진행률은 모든 카테고리에 있다** — 예산 유무(has_cost)와 무관하다. 그래서 예전
// `budget === null` 분기(비용 없는 카테고리는 바를 안 그림)가 없다 — 진행률 바가 항상 뜬다.
//
// **시세비교 줄은 없다(2026-08-29, 사용자 지시).** 한때 이 자리에 `has_benchmark` 카테고리의
// "시세 대비 …" 결과와, 비교할 수 없을 때의 "예산을 배정하면 시세와 비교할 수 있어요." 안내가
// 있었다. 둘 다 걷어냈다 — 같은 시세비교를 예산 페이지가 이미 전담하고(「카테고리별 예산
// 현황」 행 + 「총 예산 현황」 도넛), 예산 미배정 상태에서는 정보 없는 안내 문구만 행마다
// 쌓였다. 홈은 카테고리별 진행 상황만 본다. 조회 훅(dashboard/ui/use-category-benchmarks.ts)도
// 함께 지웠다 — 예산 페이지의 같은 이름 사본은 그 화면 것이라 그대로 있다.
import { Link } from "@tanstack/react-router";
import type { CategoryBudget } from "@/entities/wedding";
import { Badge, Progress } from "@/shared/ui";

export interface CategoryRowProps {
  category: CategoryBudget;
}

export function CategoryRow({ category }: CategoryRowProps) {
  const { id, name, focus, checklistProgress } = category;

  // 12_final_prototype_mockup.html의 renderHome()은 이 행 전체를 카테고리 상세로 가는 진입점으로
  // 쓴다(대시보드에서 카테고리 상세로 갈 유일한 경로). 문구/디자인 토큰은 그대로 두고 클릭 가능하다는
  // 최소 신호(화살표)만 얹는다 — 목업의 CSS를 그대로 옮기지 않는다.
  //
  // 2026-08-26 사용자 피드백: URL에 `category_code`(VENUE 등, 백엔드 계약값) 대문자가 그대로
  // 노출되는 게 거슬린다 — 여기서만 소문자로 바꿔 링크를 만든다. 백엔드 enum 자체는 그대로다,
  // 대칭 변환(router.tsx의 `id.toUpperCase()`)이 route param을 읽을 때 원래 값으로 되돌린다.
  return (
    <Link
      to="/category/$id"
      params={{ id: id.toLowerCase() }}
      className="block border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* [2026-08-29] `whitespace-nowrap` 단독이었다 — 이름이 길면 줄바꿈도 말줄임도 없이
              **컨테이너 밖으로 삐져나갔다**(부모 `min-w-0` 이 폭을 내주는 만큼 그대로 넘친다).
              `truncate` 는 같은 nowrap 에 `overflow-hidden` + 말줄임을 더한 것이라 형태는 그대로
              두고 넘침만 받는다. 옆 `Badge` 는 `shrink-0`(D16)이라 이 칸이 압력을 받는 쪽이다. */}
          <span className="truncate text-sm font-bold text-ink">{name}</span>
          {focus && <Badge>FOCUS</Badge>}
        </div>
        <span aria-hidden="true" className="text-ink-soft">
          ›
        </span>
      </div>

      <div className="mb-1.5">
        {/* 접근명은 카테고리마다 달라야 한다 — 같은 이름의 진행률이 6개면 구분이 되지 않는다. */}
        <Progress value={checklistProgress} label={`${name} 체크리스트 진행률`} />
      </div>
      <p className="text-xs text-ink-soft">체크리스트 {Math.round(checklistProgress * 100)}%</p>
    </Link>
  );
}
