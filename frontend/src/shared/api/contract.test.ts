// 백엔드 Literal 의 사본이다. 값이 바뀌면 화면이 조용히 어긋나므로 개수와 대표값을 고정한다.
// 전수 대조는 scripts 의 드리프트 게이트가 한다(docs/architecture/api-contract.md §6).
import { describe, expect, it } from "vitest";
import { CATEGORY_CODES, CHECKLIST_STATUS_BY_CATEGORY, REGION_CODES, SOURCE_TIERS, VERDICTS } from "./contract";

describe("계약 어휘", () => {
  it("카테고리는 9개다 — 7 → 9 로 늘어난 이력이 있다", () => {
    expect(CATEGORY_CODES).toHaveLength(9);
    expect(CATEGORY_CODES).toContain("HOMENEW");
    expect(CATEGORY_CODES).toContain("ETC");
  });

  it("지역은 17개다 (세분 14 + 집계 폴백 3)", () => {
    expect(REGION_CODES).toHaveLength(17);
    expect(REGION_CODES).toContain("NATIONWIDE");
  });

  it("인용 티어는 4개, verdict 는 3개다", () => {
    expect(SOURCE_TIERS).toHaveLength(4);
    expect(VERDICTS).toEqual(["SUPPORTED", "WEAK", "GENERAL"]);
  });
});

describe("체크리스트 상태는 카테고리에 달려 있다 — 타입만으로 검증되지 않는다", () => {
  it("HOMEWARE 만 다른 4값을 쓴다", () => {
    expect(CHECKLIST_STATUS_BY_CATEGORY.HOMEWARE).toEqual(["LISTED", "COMPARING", "ORDERED", "DELIVERED"]);
  });

  it("나머지 8개는 공통 4값이다", () => {
    for (const code of CATEGORY_CODES.filter((c) => c !== "HOMEWARE")) {
      expect(CHECKLIST_STATUS_BY_CATEGORY[code]).toEqual(["TODO", "DOING", "SKIP", "DONE"]);
    }
  });

  it("9개 카테고리 전부에 상태 목록이 있다 — 빠지면 화면이 빈 셀렉트를 그린다", () => {
    expect(Object.keys(CHECKLIST_STATUS_BY_CATEGORY).toSorted()).toEqual([...CATEGORY_CODES].toSorted());
  });
});
