// 백엔드 Literal 의 **사본**이다. 원본은 백엔드 app/schemas/common.py 이고, 여기 값은
// 관측 시점의 사실이지 보증이 아니다 — 드리프트 감지는 docs/architecture/api-contract.md §6.
//
// 왜 entities 가 아니라 shared 인가: session·wedding·chat 세 슬라이스가 전부 쓰는데
// .oxlintrc.json 이 entities 간 import 를 차단한다. 최하층이어야 셋이 함께 쓸 수 있다.

export const CATEGORY_CODES = [
  "MEETING", "VENUE", "SDM", "GIFT", "HOMEWARE",
  "INVITATION", "HONEYMOON", "HOMENEW", "ETC",
] as const;
export type CategoryCode = (typeof CATEGORY_CODES)[number];

export const REGION_CODES = [
  "SEOUL_GANGNAM", "SEOUL_OTHER", "BUSAN", "INCHEON", "DAEGU", "DAEJEON",
  "GWANGJU", "ULSAN", "GYEONGGI", "CHUNGCHEONG", "JEOLLA", "GYEONGSANG",
  "GANGWON", "JEJU", "NATIONWIDE", "METRO", "NON_METRO",
] as const;
export type RegionCode = (typeof REGION_CODES)[number];

export const SOURCE_TIERS = ["OFFICIAL", "NEWS", "INDUSTRY", "CONSENSUS"] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];

export const VERDICTS = ["SUPPORTED", "WEAK", "GENERAL"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** ⚠️ 소문자다. 대문자로 비교하면 조용히 안 맞는다. */
export const CHAT_ROLES = ["user", "assistant"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

/** ⚠️ 소문자다. SSE `stage` 이벤트 값이자 그래프 노드 이름이다. */
export const CHAT_STAGES = ["retrieve", "generate", "verify"] as const;
export type ChatStage = (typeof CHAT_STAGES)[number];

const GENERAL_CHECKLIST_STATUS = ["TODO", "DOING", "SKIP", "DONE"] as const;
const HOMEWARE_CHECKLIST_STATUS = ["LISTED", "COMPARING", "ORDERED", "DELIVERED"] as const;

/**
 * 🚨 체크리스트 상태는 합집합 8값이지만 **실제 유효성은 카테고리에 달려 있다.**
 * 위반하면 422 INVALID_STATUS_FOR_CATEGORY 다. 타입 시스템은 이걸 못 막으므로
 * 화면이 이 표로 선택지를 갈라야 한다.
 */
export const CHECKLIST_STATUS_BY_CATEGORY: Record<CategoryCode, readonly string[]> = Object.fromEntries(
  CATEGORY_CODES.map((code) => [
    code,
    code === "HOMEWARE" ? HOMEWARE_CHECKLIST_STATUS : GENERAL_CHECKLIST_STATUS,
  ]),
) as unknown as Record<CategoryCode, readonly string[]>;
