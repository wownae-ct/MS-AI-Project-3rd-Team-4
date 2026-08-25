import { describe, expect, it } from "vitest";
import { computeDefaultUnsurePrecision, computeUnsurePrecisionOptions } from "./wedding-date";

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

describe("computeUnsurePrecisionOptions", () => {
  it("오늘이 상반기면 올해 하반기·내년 상반기·내년 하반기 3개를 반환한다", () => {
    expect(computeUnsurePrecisionOptions(new Date(2026, 2, 10))).toEqual([
      { value: "APPROX_H2_THIS_YEAR", label: "올해 하반기" },
      { value: "APPROX_H1_NEXT_YEAR", label: "내년 상반기" },
      { value: "APPROX_H2_NEXT_YEAR", label: "내년 하반기" },
    ]);
  });

  it("오늘이 하반기면 내년 상반기·내년 하반기·그다음해 상반기 3개를 반환한다", () => {
    expect(computeUnsurePrecisionOptions(new Date(2026, 7, 26))).toEqual([
      { value: "APPROX_H1_NEXT_YEAR", label: "내년 상반기" },
      { value: "APPROX_H2_NEXT_YEAR", label: "내년 하반기" },
      { value: "APPROX_H1_YEAR_AFTER_NEXT", label: "28년 상반기" },
    ]);
  });

  it("연말 경계에서도 그다음해 상반기 라벨의 연도가 정확히 넘어간다", () => {
    expect(computeUnsurePrecisionOptions(new Date(2026, 11, 31))).toEqual([
      { value: "APPROX_H1_NEXT_YEAR", label: "내년 상반기" },
      { value: "APPROX_H2_NEXT_YEAR", label: "내년 하반기" },
      { value: "APPROX_H1_YEAR_AFTER_NEXT", label: "28년 상반기" },
    ]);
  });
});
