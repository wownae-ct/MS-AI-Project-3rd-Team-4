import { apiFetch, PERSONALIZATION_TIMEOUT_MS } from "@/shared/api";
import type {
  CategoriesResponse,
  TotalAverageBenchmark,
  WeddingCategoriesResponse,
  WeddingCategoryUpdateInput,
  WeddingCreateInput,
  WeddingProfile,
  WeddingUpdateInput,
} from "../model/types";

// createWedding·updateMyWedding·putWeddingCategories 는 개인화 라우터 에이전트를 동기로 기다린다
// (백엔드 `run_personalization()`) — 기본 타임아웃(15초)보다 긴 PERSONALIZATION_TIMEOUT_MS 를 쓴다.
//
// createWedding의 input.categories(2026-08-27 추가)는 온보딩이 고른 카테고리 활성/예산 배분을
// 생성과 함께 실어 보낸다 — 이걸로 백엔드가 처음부터 정확한 활성 집합으로 개인화 LLM 생성을
// 한 번만 태운다(이전엔 생성 직후 putWeddingCategories를 또 호출해서 활성 카테고리가 바뀔 때마다
// 개인화가 두 번 트리거됐다). 이 계약은 backend 쪽 구현이 아직 이 필드를 받도록 바뀌지 않았다면
// 동작하지 않는다 — OnboardingPage.tsx와 함께 배포해야 한다.
export function createWedding(input: WeddingCreateInput): Promise<WeddingProfile> {
  return apiFetch(
    "/api/v1/weddings",
    { method: "POST", body: JSON.stringify(input) },
    PERSONALIZATION_TIMEOUT_MS,
  ) as Promise<WeddingProfile>;
}

export function getMyWedding(): Promise<WeddingProfile> {
  return apiFetch("/api/v1/weddings/me") as Promise<WeddingProfile>;
}

export function updateMyWedding(input: WeddingUpdateInput): Promise<WeddingProfile> {
  return apiFetch(
    "/api/v1/weddings/me",
    { method: "PATCH", body: JSON.stringify(input) },
    PERSONALIZATION_TIMEOUT_MS,
  ) as Promise<WeddingProfile>;
}

export function getWeddingCategories(): Promise<WeddingCategoriesResponse> {
  return apiFetch("/api/v1/wedding-categories") as Promise<WeddingCategoriesResponse>;
}

// 2026-08-27부터 온보딩(OnboardingPage.tsx)은 이 함수를 더 이상 호출하지 않는다 — 카테고리
// 활성/배분은 createWedding의 categories 필드로 생성 시점에 함께 들어간다. 이 함수는 온보딩
// 이후 수정(예산 페이지의 카테고리 재배분 등, BudgetPage.tsx)에만 쓰인다.
export function putWeddingCategories(categories: WeddingCategoryUpdateInput[]): Promise<WeddingCategoriesResponse> {
  return apiFetch(
    "/api/v1/wedding-categories",
    { method: "PUT", body: JSON.stringify({ categories }) },
    PERSONALIZATION_TIMEOUT_MS,
  ) as Promise<WeddingCategoriesResponse>;
}

// 온보딩 예산 단계 전용(#6 호출 전, 웨딩 미존재) — API 스펙 §8.
export function getTotalAverageBenchmark(regionCode: string): Promise<TotalAverageBenchmark> {
  return apiFetch(
    `/api/v1/benchmarks/total-average?region_code=${encodeURIComponent(regionCode)}`,
  ) as Promise<TotalAverageBenchmark>;
}

// #11 — 웨딩과 무관한 전역 상수. 온보딩 6단계가 배분 행 목록·순서·"비용 없음" 판단을 여기서 얻는다.
export function getCategories(): Promise<CategoriesResponse> {
  return apiFetch("/api/v1/categories") as Promise<CategoriesResponse>;
}
