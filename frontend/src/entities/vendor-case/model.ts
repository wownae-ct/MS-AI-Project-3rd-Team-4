// 업체사례 도메인 타입 — 03_API_spec.md #24. VENUE/SDM 카테고리에서만 제공된다.

export type VendorCaseType = "GOOD" | "BAD";
export type SourceTier = "OFFICIAL" | "CONSENSUS" | "INDUSTRY";

export interface VendorCase {
  id: number;
  case_type: VendorCaseType;
  case_label: string;
  situation: string;
  key_lesson: string;
  related_item_type: string;
  source_tier: SourceTier;
}

export interface VendorCasesResponse {
  category_code: string;
  // 응답에 항상 포함되며 반드시 렌더링해야 한다(PRD RQ-F10-02) — 생략 금지.
  disclaimer: string;
  cases: VendorCase[];
}
