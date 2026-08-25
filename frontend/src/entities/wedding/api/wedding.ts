import { apiFetch } from "@/shared/api";
import type {
  CategoriesResponse,
  TotalAverageBenchmark,
  WeddingCategoriesResponse,
  WeddingCategoryUpdateInput,
  WeddingCreateInput,
  WeddingProfile,
  WeddingUpdateInput,
} from "../model/types";

export function createWedding(input: WeddingCreateInput): Promise<WeddingProfile> {
  return apiFetch("/api/v1/weddings", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<WeddingProfile>;
}

export function getMyWedding(): Promise<WeddingProfile> {
  return apiFetch("/api/v1/weddings/me") as Promise<WeddingProfile>;
}

export function updateMyWedding(input: WeddingUpdateInput): Promise<WeddingProfile> {
  return apiFetch("/api/v1/weddings/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  }) as Promise<WeddingProfile>;
}

export function getWeddingCategories(): Promise<WeddingCategoriesResponse> {
  return apiFetch("/api/v1/wedding-categories") as Promise<WeddingCategoriesResponse>;
}

export function putWeddingCategories(categories: WeddingCategoryUpdateInput[]): Promise<WeddingCategoriesResponse> {
  return apiFetch("/api/v1/wedding-categories", {
    method: "PUT",
    body: JSON.stringify({ categories }),
  }) as Promise<WeddingCategoriesResponse>;
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
