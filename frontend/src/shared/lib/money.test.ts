// 트러블슈팅 STEP 12 회귀 테스트 — wonToManwonCeil. 슬라이더 하한(paid_amount)을 만원 단위로
// 맞출 때 반올림(wonToManwon)을 쓰면 실결제액을 실제보다 낮게 내림해 이미 지급한 금액 아래로
// 예산이 내려가는 모순이 생겼다.
import { describe, expect, it } from "vitest";
import { wonToManwonCeil } from "./money";

describe("wonToManwonCeil", () => {
  it("만원 단위가 아닌 실결제액은 항상 위로 올림한다(반올림 아님)", () => {
    // 1,234,567원 → 123.4567만원 → 올림하면 124만원(1,240,000원)이어야 한다.
    // wonToManwon(반올림)이었다면 123만원(1,230,000원)으로 내려가 지급액보다 낮아졌을 것.
    expect(wonToManwonCeil(1_234_567)).toBe(124);
  });

  it("이미 만원 단위인 금액은 그대로(올림해도 값이 안 바뀜)", () => {
    expect(wonToManwonCeil(1_000_000)).toBe(100);
  });

  it("0원은 0만원", () => {
    expect(wonToManwonCeil(0)).toBe(0);
  });
});
