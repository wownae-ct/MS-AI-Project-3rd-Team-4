// 카테고리별 시세비교 조회 훅 — `pages/dashboard/ui/use-category-benchmarks.ts`의 독립 사본이다
// (2026-08-26, UX 개편 2차, 사용자 지시로 "카테고리별 배정" 행에도 같은 시세비교를 붙이며 추가).
// 내용을 그대로 복제한 이유는 그 파일 머리말 참고 — `@/entities/wedding`과 `@/entities/payment`
// 둘 다에 의존하는 cross-entity 조립이라 어느 한쪽 entities 슬라이스로도 승격할 수 없다
// (`.oxlintrc.json`의 `entities/**` override, "entities는 다른 entity 슬라이스를 import할 수
// 없다"). 이 저장소엔 그런 조립을 위한 features/widgets 레이어가 없어 짧은 중복을 택한다.
//
// `GET /benchmarks/compare`(category_code+item_code+amount 필수)는 "내 금액 하나를 시세와
// 비교"하는 API지 카테고리 전체를 훑는 개요 위젯이 아니다 — 그래서 카테고리마다 item_code="TOTAL"
// + 그 카테고리의 배정 예산(planned_budget)으로 개별 호출해 "배정 예산 vs 지역 시세"를 만든다.
// region_code는 서버가 세션의 웨딩에서 직접 읽으므로 클라이언트가 안 보내도 된다
// (backend/app/routers/budget.py:209) — 추가 조회가 필요 없다.
//
// `has_benchmark=true`인 카테고리는 지금 VENUE/SDM 둘뿐이다(backend/app/core/categories.py) —
// N+1이 아니라 사실상 최대 2회 호출이다.
//
// 파라미터는 `WeddingCategory` 전용 타입이 아니라 구조적 타입으로 받는다 — 대시보드 사본의
// `DashboardCategorySummary`도 category_code/planned_budget을 그대로 갖고 있어 같은 모양을 쓴다.
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
        // 카테고리 상수 조회 실패는 시세비교를 못 하게 할 뿐 — 나머지 화면은 그대로 보여준다.
      });
    return () => {
      cancelled = true;
    };
  }, [categories]);

  return { hasBenchmarkByCode, benchmarkByCode };
}
