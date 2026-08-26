// 업체사례 도메인 타입 — 03_API_spec.md #24. VENUE/SDM 카테고리에서만 제공된다.

export type VendorCaseType = "GOOD" | "BAD";
export type SourceTier = "OFFICIAL" | "CONSENSUS" | "INDUSTRY";

/**
 * 팀이 재구성한 이 사례와 관련된 실제 공식 분쟁조정 사례(DS2_KCA) — backend `VendorCaseOut.
 * related_cases`(backend/app/schemas/vendor_case.py, PR #86)가 `app/schemas/chat.py::CitationOut`
 * 을 그대로 재사용해 응답한다(근거 표시 형태를 새로 만들 이유가 없다는 게 백엔드 쪽 판단, DRY).
 *
 * 프론트는 이 모양을 `entities/chat`의 `ChatCitation`과 로컬로 중복 정의한다 — entities는 서로
 * import할 수 없다(.oxlintrc.json no-restricted-imports). `source_tier`는 백엔드
 * `app/schemas/common.py::SourceTier`(OFFICIAL/NEWS/INDUSTRY/CONSENSUS, 4값) 원본 그대로 —
 * 위 `VendorCase.source_tier`(3값, 팀 카드 자체 등급)와는 다른 필드라 값 집합도 다르다.
 */
export interface VendorCaseRelatedCitation {
  chunk_id: number;
  title: string;
  source_tier: "OFFICIAL" | "NEWS" | "INDUSTRY" | "CONSENSUS";
  // 팀 자체 저작 콘텐츠는 원문 URL이 없다 — nullable(entities/chat의 ChatCitation과 같은 이유).
  source_url: string | null;
}

export interface VendorCase {
  id: number;
  case_type: VendorCaseType;
  case_label: string;
  situation: string;
  key_lesson: string;
  related_item_type: string;
  source_tier: SourceTier;
  // 관련 사례가 없으면 빈 배열 — 백엔드가 지어내지 않는다(항상 존재하는 필드, undefined 아님).
  related_cases: VendorCaseRelatedCitation[];
}

export interface VendorCasesResponse {
  category_code: string;
  // 응답에 항상 포함되며 반드시 렌더링해야 한다(PRD RQ-F10-02) — 생략 금지.
  disclaimer: string;
  cases: VendorCase[];
}
