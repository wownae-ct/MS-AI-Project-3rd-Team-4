// 웨딩 카테고리 배지 색 — D17 (docs/design/decisions.md), 2026-08-29, 사용자 지시.
//
// **왜 `shared` 인가** — 호출부가 `entities/payment`(비용 관리의 결제 목록)와 `pages/report`
// (「다음에 확인하면 좋아요」) 양쪽인데, `.oxlintrc.json` 이 *"entities는 상위 레이어와 다른
// entity 슬라이스를 import할 수 없다"* 로 막는다. `entities/wedding` 에 두면 전자가 못 쓴다.
// `shared` 가 둘 다 닿는 유일한 층이고, `SourceList.tsx` 가 이미 `SourceTier` 도메인 값을 아는
// 선례가 있다.
//
// **완성된 클래스 문자열을 그대로 둔다(조립 금지)** — Tailwind 스캐너는 소스를 평문으로 읽어
// 런타임 조립(`bg-category-${code}-soft`)을 찾지 못하고, 빌드는 성공한 채 스타일만 사라진다.
// `entities/payment/ui/payment-labels.ts` 의 `PAYMENT_TYPE_BADGE_CLASS` 와 같은 관례다.
//
// 코드 목록의 출처는 백엔드 상수 `app/core/categories.py`(9종) —
// `docs/backend-analysis/03-data-model.md` 「카테고리 표시명은 DB 에 없다」 표.

/** `category_code` → 배지 색 클래스(채움 변이 전제 — 배경 soft + 글자 진한색). */
export const CATEGORY_BADGE_CLASS: Record<string, string> = {
  MEETING: "bg-category-meeting-soft text-category-meeting",
  VENUE: "bg-category-venue-soft text-category-venue",
  SDM: "bg-category-sdm-soft text-category-sdm",
  GIFT: "bg-category-gift-soft text-category-gift",
  HOMEWARE: "bg-category-homeware-soft text-category-homeware",
  INVITATION: "bg-category-invitation-soft text-category-invitation",
  HONEYMOON: "bg-category-honeymoon-soft text-category-honeymoon",
  HOMENEW: "bg-category-homenew-soft text-category-homenew",
  ETC: "bg-category-etc-soft text-category-etc",
};

/**
 * `Badge` 의 `tone` 에 그대로 넘긴다.
 *
 * 모르는 코드는 **색을 지어내지 않는다.** `category_code` 는 서버가 주는 `string` 이지 union 이
 * 아니라(entities/wedding/model/types.ts), 백엔드가 10번째 카테고리를 추가해도 여기서 터지면
 * 안 된다. 빈 문자열이면 `Badge` 가 변이 기본색(primary 채움)으로 떨어뜨린다 — 종전과 같은 모양.
 */
export function categoryBadgeClass(code: string): string {
  return CATEGORY_BADGE_CLASS[code] ?? "";
}
