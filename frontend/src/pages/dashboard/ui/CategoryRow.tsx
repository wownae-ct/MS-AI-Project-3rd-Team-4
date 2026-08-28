// 카테고리별 체크리스트 진행률 + 시세비교 한 줄 (UX 개편, 2026-08-26 — 예산 지불률 표시를
// 이 자리에서 걷어내고 체크리스트 진행률+시세비교로 바꿨다. 예산 상세는 이제 예산 페이지가
// 전담한다). 원래 시각 스펙: docs/mockups/s2-dashboard.html:219-284 — 그 목업이 그리던 "예산
// 지불률" 축을 이 화면에서는 더 이상 쓰지 않는다(ADR 0006 — 규범/요구사항 변경이 목업을 이긴다).
//
// **체크리스트 진행률은 모든 카테고리에 있다** — 예산 유무(has_cost)와 무관하다. 그래서 예전
// `budget === null` 분기(비용 없는 카테고리는 바를 안 그림)가 없다 — 진행률 바가 항상 뜬다.
//
// **시세비교는 `hasBenchmark`(카테고리 상수의 has_benchmark, use-category-benchmarks.ts)가
// true인 카테고리에서만 그 자리가 생긴다.** `benchmark`가 undefined면 "아직 비교할 수 없다"는
// 뜻(예산 미배정 또는 조회 실패) — 숫자를 지어내지 않고 안내 문구만 낸다.
//
// **D6 — 상태색을 쓰지 않는다.** "높음/평균/낮음"(percentile_label)을 색으로 구분하지 않고
// 텍스트+배지로만 전달한다(D8 팔레트 게이트가 임의 색 추가를 어차피 막는다).
import { Link } from "@tanstack/react-router";
import type { BenchmarkComparison } from "@/entities/payment";
import type { CategoryBudget } from "@/entities/wedding";
import { Badge, Money, Progress } from "@/shared/ui";

export interface CategoryRowProps {
  category: CategoryBudget;
  hasBenchmark: boolean;
  /** undefined = 이 카테고리에 대해 아직 비교 결과가 없다(예산 미배정 또는 조회 실패/데이터 없음). */
  benchmark: BenchmarkComparison | undefined;
}

export function CategoryRow({ category, hasBenchmark, benchmark }: CategoryRowProps) {
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
          <span className="text-sm font-bold whitespace-nowrap text-ink">{name}</span>
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

      {hasBenchmark &&
        (benchmark ? (
          // flex-wrap — 배지가 이제 안 눌리므로(D16) 좁은 폭에서는 배지가 다음 줄로 내려가야
          // 한다. 없으면 앞의 문구가 세로로 접히면서 줄 높이만 늘어난다(BudgetDonut 은 이미 켜져
          // 있었다 — 같은 줄 구성인데 여기와 CategoryAllocationRow 만 빠져 있었다).
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
            시세 대비 {benchmark.percentile_label} · 중앙값 <Money value={benchmark.median_price} className="text-xs" />
            <Badge>{benchmark.ratio_to_median.toFixed(2)}배</Badge>
          </p>
        ) : (
          <p className="mt-1 text-xs text-ink-soft">예산을 배정하면 시세와 비교할 수 있어요.</p>
        ))}
    </Link>
  );
}
