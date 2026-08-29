// 카테고리 배지 색 매핑 계약 (D17).
//
// 고정하려는 사고 셋 —
//   ① 백엔드 상수의 9개 코드 중 하나가 매핑에서 빠져 그 카테고리만 색이 없는 채로 나가는 것
//   ② 복사·붙여넣기로 두 카테고리가 같은 색을 쓰게 되는 것(색으로 구분하려고 만든 것인데)
//   ③ 모르는 코드가 들어왔을 때 색을 지어내거나 터지는 것
import { describe, expect, it } from "vitest";
import { CATEGORY_BADGE_CLASS, categoryBadgeClass } from "./category-badge";

// 출처: backend `app/core/categories.py` — docs/backend-analysis/03-data-model.md 「카테고리
// 표시명은 DB 에 없다」 표. 여기 목록이 그 표와 어긋나면 둘 중 하나가 낡은 것이다.
const BACKEND_CATEGORY_CODES = [
  "MEETING",
  "VENUE",
  "SDM",
  "GIFT",
  "HOMEWARE",
  "INVITATION",
  "HONEYMOON",
  "HOMENEW",
  "ETC",
] as const;

describe("categoryBadgeClass", () => {
  it("백엔드의 9개 카테고리 코드를 빠짐없이 덮는다", () => {
    expect(Object.keys(CATEGORY_BADGE_CLASS).toSorted()).toEqual([...BACKEND_CATEGORY_CODES].toSorted());
  });

  it("아홉 색이 서로 겹치지 않는다", () => {
    const classes = Object.values(CATEGORY_BADGE_CLASS);
    expect(new Set(classes).size).toBe(classes.length);
  });

  it("모르는 코드는 빈 문자열 — 색을 지어내지 않고 Badge 기본 채움으로 떨어진다", () => {
    expect(categoryBadgeClass("NOT_A_CATEGORY")).toBe("");
    expect(categoryBadgeClass("")).toBe("");
  });

  // Tailwind 스캐너는 소스를 평문으로 읽는다 — 런타임 조립이 섞이면 빌드는 성공한 채 스타일만
  // 사라진다. 완성된 리터럴 두 유틸리티(배경 + 글자)인지 형태로 확인한다.
  it("완성된 리터럴 클래스 두 개(soft 배경 + 진한 글자)로만 이뤄진다", () => {
    for (const [code, className] of Object.entries(CATEGORY_BADGE_CLASS)) {
      expect(className, code).toMatch(/^bg-category-[a-z]+-soft text-category-[a-z]+$/u);
    }
  });
});
