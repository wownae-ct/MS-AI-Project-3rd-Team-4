// 7·8단계 카테고리 목록 + 2단계/8단계가 같이 쓰는 참고 벤치마크 조회를 묶은 훅 —
// OnboardingPage.tsx에서 뽑아냈다(oxlint max-lines 300줄 상한 초과, 레드팀 감사 수정 배치로
// 에러 추적 state/분기가 늘어나면서 넘김). 두 effect 모두 실패를 조용히 삼키지 않고 별도
// 에러 문자열로 남긴다 — "정상적으로 0건"과 "네트워크 실패"를 화면에서 구분하기 위해서다.
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { getCategories, getTotalAverageBenchmark, type TotalAverageBenchmark } from "@/entities/wedding";
import { categoriesToAllocationRows, type AllocationRow } from "./steps";

export interface OnboardingData {
  benchmark: TotalAverageBenchmark | null;
  benchmarkError: string | null;
  allocationRows: AllocationRow[];
  setAllocationRows: Dispatch<SetStateAction<AllocationRow[]>>;
  isLoadingCategories: boolean;
  categoriesError: string | null;
}

export function useOnboardingData(regionCode: string): OnboardingData {
  const [benchmark, setBenchmark] = useState<TotalAverageBenchmark | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [allocationRows, setAllocationRows] = useState<AllocationRow[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  // 지역이 바뀔 때마다 참고 벤치마크를 다시 받는다 — 2단계 캡션과 8단계 "미정일 때 참고 총예산"이
  // 같은 값을 쓴다(Step2RegionBudget.tsx 머리말 참조). 실패해도 화면 진행 자체는 막지 않는다 —
  // 다만 실패했다는 사실은 조용히 넘기지 않고 알린다.
  useEffect(() => {
    let cancelled = false;
    setBenchmarkError(null);
    getTotalAverageBenchmark(regionCode)
      .then((result) => {
        if (!cancelled) setBenchmark(result);
      })
      .catch(() => {
        if (cancelled) return;
        setBenchmark(null);
        setBenchmarkError("평균 예산 참고값을 불러오지 못했습니다. 총예산을 직접 입력해 주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, [regionCode]);

  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((result) => {
        if (!cancelled) {
          setAllocationRows(categoriesToAllocationRows(result.categories));
          setIsLoadingCategories(false);
          setCategoriesError(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoadingCategories(false);
        setCategoriesError("카테고리 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { benchmark, benchmarkError, allocationRows, setAllocationRows, isLoadingCategories, categoriesError };
}
