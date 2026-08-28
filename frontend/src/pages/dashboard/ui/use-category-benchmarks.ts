// 카테고리별 시세비교 조회 훅 — DashboardPage.tsx에서 뽑아냈다(oxlint max-lines 300줄 상한,
// 훅 단위로 독립 테스트하기 위함이기도 하다).
//
// **entities로 승격하지 않는다(2026-08-26, UX 개편 2차 — 처음엔 entities/wedding으로 옮겼다가
// 되돌렸다).** 예산탭(BudgetPage)도 같은 시세비교가 필요해졌지만, 이 훅은 `@/entities/wedding`
// (getCategories)과 `@/entities/payment`(getBenchmarkCompare) 둘 다에 의존한다 — FSD 경계
// 규칙(`.oxlintrc.json`의 `entities/**` override)이 "entities는 다른 entity 슬라이스를
// import할 수 없다"를 강제해서, 어느 한쪽 entities 슬라이스 안에도 넣을 수 없다(cross-entity
// 조립은 pages/app 레이어의 일이다). 이 저장소엔 그런 조립을 위한 features/widgets 레이어가
// 없으므로, 승격 대신 예산탭에 같은 내용의 독립 사본(`pages/budget/ui/use-category-benchmarks.ts`)을
// 둔다 — 억지로 공유하려다 아키텍처 규칙과 계속 부딪히는 것보다 짧은 중복이 낫다는 판단.
//
// `GET /benchmarks/compare`(category_code+item_code+amount 필수)는 "내 금액 하나를 시세와
// 비교"하는 API지 카테고리 전체를 훑는 개요 위젯이 아니다 — 그래서 카테고리마다 item_code="TOTAL"
// + 그 카테고리의 배정 예산(planned_budget)으로 개별 호출해 "배정 예산 vs 지역 시세"를 만든다.
// region_code는 서버가 세션의 웨딩에서 직접 읽으므로 클라이언트가 안 보내도 된다
// (backend/app/routers/budget.py:209) — 추가 조회가 필요 없다.
//
// `has_benchmark=true`인 카테고리는 지금 VENUE/SDM 둘뿐이다(backend/app/core/categories.py) —
// N+1이 아니라 사실상 최대 2회 호출이다. 이 숫자가 늘어나 배치 조회가 필요해지면 그때
// dev-35에게 백엔드 배치 엔드포인트를 인계한다(지금은 인계하지 않는다).
//
// 파라미터는 `DashboardCategorySummary` 전용 타입이 아니라 구조적 타입으로 받는다 — 예산탭 사본의
// `WeddingCategory`도 category_code/planned_budget을 그대로 갖고 있어 같은 모양을 쓴다.
import { useEffect, useState } from "react";
import { getBenchmarkCompare, type BenchmarkComparison } from "@/entities/payment";
import { getCategories } from "@/entities/wedding";

const BENCHMARK_ITEM_CODE = "TOTAL";

export interface BenchmarkTargetCategory {
  category_code: string;
  planned_budget: number;
}

export interface CategoryBenchmarks {
  /** 카테고리 상수(GET /categories)의 has_benchmark — 이 카테고리가 시세비교 "대상"인지.
      false면 "시세 데이터 없음"이 아니라 애초에 해당 사항이 없다는 뜻이라 화면에서 구분해야 한다. */
  hasBenchmarkByCode: ReadonlyMap<string, boolean>;
  /** 실제로 비교에 성공한 결과만 담는다 — 대상이어도 404(BENCHMARK_NOT_AVAILABLE)거나
      예산 미배정(0원)이면 여기 없다. */
  benchmarkByCode: ReadonlyMap<string, BenchmarkComparison>;
}

export function useCategoryBenchmarks(categories: readonly BenchmarkTargetCategory[]): CategoryBenchmarks {
  const [hasBenchmarkByCode, setHasBenchmarkByCode] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [benchmarkByCode, setBenchmarkByCode] = useState<ReadonlyMap<string, BenchmarkComparison>>(new Map());

  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((res) => {
        if (cancelled) return;
        const hasBenchmarkMap = new Map(res.categories.map((c) => [c.code, c.has_benchmark]));
        setHasBenchmarkByCode(hasBenchmarkMap);

        // planned_budget === 0인 카테고리는 건너뛴다 — 0원을 시세와 비교하면 ratio가 0이 돼
        // "낮음"으로 오독된다("예산 배정 전"과 "실제로 시세보다 훨씬 싸다"는 다른 정보다).
        const targets = categories.filter((c) => (hasBenchmarkMap.get(c.category_code) ?? false) && c.planned_budget > 0);

        // Promise.allSettled — 한 카테고리의 404(BENCHMARK_NOT_AVAILABLE)가 나머지 결과까지
        // 지우면 안 된다. 실패한 카테고리는 그냥 맵에서 빠진다(지어내지 않는다).
        Promise.allSettled(
          targets.map((c) =>
            getBenchmarkCompare({ categoryCode: c.category_code, itemCode: BENCHMARK_ITEM_CODE, amount: c.planned_budget }),
          ),
        ).then((results) => {
          if (cancelled) return;
          const map = new Map<string, BenchmarkComparison>();
          results.forEach((result, index) => {
            if (result.status === "fulfilled") map.set(targets[index].category_code, result.value);
          });
          setBenchmarkByCode(map);
        });
      })
      .catch(() => {
        // 카테고리 상수 조회 실패는 시세비교를 못 하게 할 뿐 — 체크리스트 진행률은 그대로 보여준다.
      });
    return () => {
      cancelled = true;
    };
  }, [categories]);

  return { hasBenchmarkByCode, benchmarkByCode };
}
