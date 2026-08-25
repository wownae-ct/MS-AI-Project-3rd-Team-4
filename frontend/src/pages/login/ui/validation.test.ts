import { describe, expect, it } from "vitest";
import { isValidEmail, isValidPassword } from "./validation";

describe("isValidEmail", () => {
  it.each(["a@b.c", "user.name+tag@example.co.kr", "a@b-c.com"])("%s 는 통과한다", (value) => {
    expect(isValidEmail(value)).toBe(true);
  });

  it.each(["", "not-an-email", "a@b", "a@.com", "@b.c", "a b@c.com", "a@b .com"])(
    "%s 는 막는다",
    (value) => {
      expect(isValidEmail(value)).toBe(false);
    },
  );
});

describe("isValidPassword — 영문+숫자+특수문자 조합, 8자 이상", () => {
  it.each(["pw123456!", "Abcdefg1@", "복잡a1!23456"])("%s 는 통과한다", (value) => {
    expect(isValidPassword(value)).toBe(true);
  });

  it("정확히 8자면 통과한다 — 하한 경계", () => {
    expect(isValidPassword("ab1!2345")).toBe(true);
  });

  it("7자면 막는다 — 하한 경계 바로 아래", () => {
    expect(isValidPassword("ab1!234")).toBe(false);
  });

  it.each([
    ["12345678!", "영문이 없다"],
    ["abcdefgh!", "숫자가 없다"],
    ["abcdefg1", "특수문자가 없다"],
  ])("%s 는 막는다 (%s)", (value) => {
    expect(isValidPassword(value)).toBe(false);
  });
});
