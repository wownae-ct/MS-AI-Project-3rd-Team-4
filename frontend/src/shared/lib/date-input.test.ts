import { describe, expect, it } from "vitest";
import {
  caretAfterDateFormat,
  formatDateDigits,
  isCompleteDateDigits,
  toDateDigits,
  unformatDate,
} from "./date-input";

describe("toDateDigits", () => {
  it("숫자만 남긴다", () => {
    expect(toDateDigits("2026-08-29")).toBe("20260829");
    expect(toDateDigits("2026. 8. 29.")).toBe("2026829");
    expect(toDateDigits("2026/08/29")).toBe("20260829");
  });

  it("8자리를 넘기면 잘라낸다 — 오타로 자릿수가 늘어나는 경로를 막는다", () => {
    expect(toDateDigits("202660829")).toBe("20266082");
    expect(toDateDigits("2026082912345")).toBe("20260829");
  });

  it("한글·기호·전각숫자를 전부 떨어뜨린다", () => {
    expect(toDateDigits("이천이십육년")).toBe("");
    expect(toDateDigits("２０２６")).toBe("");
  });
});

describe("formatDateDigits — 부분 입력에도 구분자를 붙인다", () => {
  it("자릿수에 따라 단계적으로 구분자가 나타난다", () => {
    expect(formatDateDigits("")).toBe("");
    expect(formatDateDigits("20")).toBe("20");
    expect(formatDateDigits("2026")).toBe("2026");
    expect(formatDateDigits("20260")).toBe("2026-0");
    expect(formatDateDigits("202608")).toBe("2026-08");
    expect(formatDateDigits("2026082")).toBe("2026-08-2");
    expect(formatDateDigits("20260829")).toBe("2026-08-29");
  });

  it("4·6번째 자리 직후에는 뒤따르는 구분자를 아직 붙이지 않는다(백스페이스 한 번을 삼키지 않는다)", () => {
    expect(formatDateDigits("2026")).not.toContain("-");
    expect(formatDateDigits("202608")).toBe("2026-08");
    expect(formatDateDigits("202608").endsWith("-")).toBe(false);
  });

  it("unformatDate 로 되감으면 원래 숫자열이다", () => {
    expect(unformatDate(formatDateDigits("20260829"))).toBe("20260829");
    expect(unformatDate(formatDateDigits("20260"))).toBe("20260");
  });
});

describe("caretAfterDateFormat", () => {
  it("구분자가 끼어들어도 같은 숫자 뒤에 캐럿이 남는다", () => {
    // "2026-08-29" 에서 숫자 4개 뒤 = "2026" 바로 뒤 = 인덱스 4
    expect(caretAfterDateFormat("2026-08-29", 4)).toBe(4);
    // 숫자 5개 뒤 = "2026-0" 뒤 = 인덱스 6
    expect(caretAfterDateFormat("2026-08-29", 5)).toBe(6);
    expect(caretAfterDateFormat("2026-08-29", 8)).toBe(10);
  });

  it("맨 앞은 0, 남은 숫자보다 큰 값은 끝으로 접는다", () => {
    expect(caretAfterDateFormat("2026-08-29", 0)).toBe(0);
    expect(caretAfterDateFormat("2026-08-29", -3)).toBe(0);
    expect(caretAfterDateFormat("2026", 8)).toBe(4);
  });
});

describe("isCompleteDateDigits", () => {
  it("8자리를 다 채웠을 때만 참이다", () => {
    expect(isCompleteDateDigits("20260829")).toBe(true);
    expect(isCompleteDateDigits("2026082")).toBe(false);
    expect(isCompleteDateDigits("")).toBe(false);
  });
});
