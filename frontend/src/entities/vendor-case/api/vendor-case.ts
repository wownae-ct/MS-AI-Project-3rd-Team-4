import { apiFetch } from "@/shared/api";
import type { VendorCasesResponse, VendorCaseType } from "../model";

export function getVendorCases(categoryCode: string, caseType?: VendorCaseType): Promise<VendorCasesResponse> {
  const query = new URLSearchParams({ category_code: categoryCode });
  if (caseType) query.set("case_type", caseType);
  return apiFetch(`/api/v1/vendor-cases?${query.toString()}`) as Promise<VendorCasesResponse>;
}
