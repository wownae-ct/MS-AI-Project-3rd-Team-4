import { describe, expect, it } from "vitest";
import { computeDefaultUnsurePrecision } from "./wedding-date";

describe("computeDefaultUnsurePrecision", () => {
  it("상반기(1~6월)에서 6개월 뒤는 같은 해 하반기다", () => {
    expect(computeDefaultUnsurePrecision(new Date(2026, 0, 15))).toBe("APPROX_H2_THIS_YEAR");
    expect(computeDefaultUnsurePrecision(new Date(2026, 5, 30))).toBe("APPROX_H2_THIS_YEAR");
  });

  it("하반기(7~12월)에서 6개월 뒤는 다음 해 상반기다", () => {
    expect(computeDefaultUnsurePrecision(new Date(2026, 6, 1))).toBe("APPROX_H1_NEXT_YEAR");
    expect(computeDefaultUnsurePrecision(new Date(2026, 11, 31))).toBe("APPROX_H1_NEXT_YEAR");
  });

  it("연말 경계에서도 해가 정확히 넘어간다", () => {
    expect(computeDefaultUnsurePrecision(new Date(2026, 11, 1))).toBe("APPROX_H1_NEXT_YEAR");
  });
});
