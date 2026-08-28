// source_tier 한글 라벨 — entities/chat·checklist·vendor-case 가 공통으로 쓰는 값이라 shared에 둔다
// (entities는 서로를 import할 수 없다 — .oxlintrc.json no-restricted-imports).
// 모르는 값은 지어내지 않고 원본 그대로 보여준다 — PaymentRow.tsx/RecoRow.tsx의 라벨 매핑과 같은 원칙.
export const SOURCE_TIER_LABEL: Record<string, string> = {
  OFFICIAL: "공식",
  CONSENSUS: "합의",
  INDUSTRY: "업계",
};
