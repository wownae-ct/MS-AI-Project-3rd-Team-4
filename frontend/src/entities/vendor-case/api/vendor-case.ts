// 업체 사례(#31) REST 클라이언트 — 카테고리별 좋은/나쁜 사례를 읽어온다.
// 특정 업체를 지목하지 않는 것이 이 기능의 전제라, 응답에도 업체명은 담기지 않는다.
import { apiFetch } from "@/shared/api";
import type { VendorCasesResponse, VendorCaseType } from "../model";

export function getVendorCases(categoryCode: string, caseType?: VendorCaseType): Promise<VendorCasesResponse> {
  const query = new URLSearchParams({ category_code: categoryCode });
  if (caseType) query.set("case_type", caseType);
  return apiFetch(`/api/v1/vendor-cases?${query.toString()}`) as Promise<VendorCasesResponse>;
}
