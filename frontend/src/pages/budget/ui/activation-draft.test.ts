// 「카테고리 사용 여부」의 **저장 규칙**. 예전엔 `CategoryActivationPanel.test.tsx` 가 렌더를 통해
// 이 계약을 봤는데, 2026-08-29 개편으로 PUT 이 패널 밖(`use-activation-save.ts`)으로 나가면서
// 규칙만 순수 함수로 남았다 — 계약은 그대로 옮겨 왔고 여기가 그 자리다.
//
//   ① PUT 은 부분 갱신이 아니다 — 9개 전체를 보내고, 만지지 않는 필드는 조회값 그대로
//   ② 끄는 카테고리의 예산은 0 으로 — **단 이미 지불액이 있으면 못 내린다**(400 BUDGET_BELOW_PAID)
//   ③ 끄기의 낙관적 행은 서버가 돌려줄 값과 **같아야 한다** — 아니면 응답 도착 시 숫자가 튄다
import { describe, expect, it } from "vitest";
import type { WeddingCategory } from "@/entities/wedding";
import {
  applyDeactivations,
  buildActivationPayload,
  hasActivationChanges,
  splitActivationChanges,
} from "./activation-draft";

function category(overrides: Partial<WeddingCategory> = {}): WeddingCategory {
  return {
    category_code: "VENUE",
    name_ko: "예식장",
    tier: "FOCUS",
    is_active: true,
    planned_budget: 0,
    paid_amount: 0,
    scheduled_amount: 0,
    remaining: 0,
    selected_options: null,
    display_order: 1,
    has_benchmark: false,
    has_vendor_cases: false,
    ...overrides,
  };
}

const VENUE = category();
const HOMEWARE = category({
  category_code: "HOMEWARE",
  name_ko: "혼수",
  is_active: false,
  display_order: 2,
  selected_options: ["가전"],
});

describe("buildActivationPayload", () => {
  it("9개 전체를 보내고, 만지지 않은 필드는 조회값 그대로 되돌려 보낸다", () => {
    expect(buildActivationPayload([VENUE, HOMEWARE], { HOMEWARE: true })).toEqual([
      { category_code: "VENUE", is_active: true, planned_budget: 0, selected_options: null, display_order: 1 },
      {
        category_code: "HOMEWARE",
        is_active: true,
        planned_budget: 0,
        // 지우면 온보딩에서 고른 하위 옵션이 조용히 사라진다.
        selected_options: ["가전"],
        display_order: 2,
      },
    ]);
  });

  // 서버의 초과 검증은 is_active 무관 9개 전체 합이라(services/wedding.py) 끄면서 금액을
  // 남기면 "화면엔 그 행이 없는데 초과" 상태가 만들어진다.
  it("끄는 카테고리의 예산은 0 으로 민다", () => {
    const rows = [category({ planned_budget: 12_000_000 })];

    expect(buildActivationPayload(rows, { VENUE: false })[0]).toMatchObject({
      is_active: false,
      planned_budget: 0,
    });
  });

  // planned_budget < paid_amount 는 400 BUDGET_BELOW_PAID 다 — 0 으로 밀면 저장 자체가 막힌다.
  it("이미 지불액이 있으면 예산을 그대로 둔다", () => {
    const rows = [category({ planned_budget: 12_000_000, paid_amount: 5_000_000 })];

    expect(buildActivationPayload(rows, { VENUE: false })[0]).toMatchObject({
      is_active: false,
      planned_budget: 12_000_000,
    });
  });
});

describe("splitActivationChanges / hasActivationChanges", () => {
  it("켜는 것과 끄는 것을 가른다 — 화면이 둘을 다르게 다루기 때문이다", () => {
    expect(splitActivationChanges([VENUE, HOMEWARE], { VENUE: false, HOMEWARE: true })).toEqual({
      activated: ["HOMEWARE"],
      deactivated: ["VENUE"],
    });
  });

  it("초안이 원본과 같으면 변경 없음 — 46초짜리 재생성을 헛돌게 하지 않는다", () => {
    expect(hasActivationChanges([VENUE, HOMEWARE], { VENUE: true, HOMEWARE: false })).toBe(false);
    expect(splitActivationChanges([VENUE, HOMEWARE], {})).toEqual({ activated: [], deactivated: [] });
  });
});

describe("applyDeactivations", () => {
  // 서버 `_wedding_category_out` 은 remaining 을 planned_budget - paid_amount 로 다시 계산한다.
  // 여기서 같이 계산하지 않으면 46초 뒤 응답이 도착할 때 화면의 숫자가 튄다.
  it("끈 행만 서버가 돌려줄 값과 똑같이 미리 바꾼다", () => {
    const rows = [category({ planned_budget: 12_000_000, remaining: 12_000_000 }), HOMEWARE];

    expect(applyDeactivations(rows, ["VENUE"])[0]).toMatchObject({
      is_active: false,
      planned_budget: 0,
      remaining: 0,
    });
  });

  it("지불액이 있으면 예산을 남기고 remaining 만 다시 계산한다", () => {
    const rows = [category({ planned_budget: 12_000_000, paid_amount: 5_000_000, remaining: 7_000_000 })];

    expect(applyDeactivations(rows, ["VENUE"])[0]).toMatchObject({
      is_active: false,
      planned_budget: 12_000_000,
      remaining: 7_000_000,
    });
  });

  it("켜는 쪽은 손대지 않는다 — 그 결과는 서버만 안다(자리표시가 대신한다)", () => {
    expect(applyDeactivations([VENUE, HOMEWARE], [])).toEqual([VENUE, HOMEWARE]);
    expect(applyDeactivations([VENUE, HOMEWARE], ["VENUE"])[1]).toBe(HOMEWARE);
  });
});
