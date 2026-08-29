// `isChecklistItemKept` — 재생성 뒤에도 남을 항목인가.
//
// 이 술어가 틀리면 두 가지가 동시에 어긋난다: 확인 다이얼로그가 예고한 개수와, 재생성 중
// 화면에 남는 항목. 특히 **초기 상태가 카테고리마다 다르다**(HOMEWARE 만 LISTED)는 점이
// 조용히 틀리기 쉬워 여기서 못 박는다.
import { describe, expect, it } from "vitest";
import { isChecklistItemKept, type ChecklistItem, type ChecklistStatus } from "./model";

function makeItem(status: ChecklistStatus, memo: string | null = null): ChecklistItem {
  return {
    id: "item-1",
    category_code: "VENUE",
    item_type: "PREP",
    option_group: null,
    origin: "LLM",
    status,
    group_label: "준비 사항",
    title: "예식장 답사",
    body: "",
    priority: "mid",
    source_tier: null,
    source_label: "",
    source_url: null,
    tag: null,
    memo,
  };
}

describe("isChecklistItemKept — 일반 카테고리(초기 상태 TODO)", () => {
  it("손대지 않은 항목은 남지 않는다", () => {
    expect(isChecklistItemKept(makeItem("TODO"), "VENUE")).toBe(false);
  });

  it("상태를 바꿨으면 남는다", () => {
    expect(isChecklistItemKept(makeItem("DOING"), "VENUE")).toBe(true);
    expect(isChecklistItemKept(makeItem("SKIP"), "VENUE")).toBe(true);
    expect(isChecklistItemKept(makeItem("DONE"), "VENUE")).toBe(true);
  });

  it("메모만 남겼어도 남는다", () => {
    expect(isChecklistItemKept(makeItem("TODO", "주차 30대"), "VENUE")).toBe(true);
  });

  it("빈 문자열 메모는 흔적으로 치지 않는다", () => {
    expect(isChecklistItemKept(makeItem("TODO", ""), "VENUE")).toBe(false);
  });
});

describe("isChecklistItemKept — HOMEWARE(초기 상태 LISTED)", () => {
  // 🚨 다른 카테고리의 초기값(TODO)으로 판정하면 **손대지 않은 LISTED 항목이 전부 「남는다」로**
  // 뒤집힌다 — 확인창이 "3개만 남아요"라고 해 놓고 수십 개를 남긴 채 기다리는 화면이 된다.
  it("초기 상태 LISTED 는 손대지 않은 것이다", () => {
    expect(isChecklistItemKept(makeItem("LISTED"), "HOMEWARE")).toBe(false);
  });

  it("그다음 상태부터는 남는다", () => {
    expect(isChecklistItemKept(makeItem("COMPARING"), "HOMEWARE")).toBe(true);
    expect(isChecklistItemKept(makeItem("DELIVERED"), "HOMEWARE")).toBe(true);
  });
});

describe("isChecklistItemKept — 알 수 없는 카테고리", () => {
  // 카테고리 상수표에 없는 코드가 오면 초기 상태를 알 수 없다. 그때는 **덜 남는다고** 답한다 —
  // 반대로 답하면 사라질 항목을 남을 것처럼 보여 주게 되고, 그 오차는 사용자가 손해를 본다.
  it("초기 상태를 모르면 남지 않는 쪽으로 답한다(메모가 없는 한)", () => {
    expect(isChecklistItemKept(makeItem("DOING"), "UNKNOWN_CODE")).toBe(false);
    expect(isChecklistItemKept(makeItem("DOING", "메모"), "UNKNOWN_CODE")).toBe(true);
  });
});
