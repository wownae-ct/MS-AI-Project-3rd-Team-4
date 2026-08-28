// 백엔드 에러 바디는 예외 없이 { error: { code, message, ...extra } } 다.
// 분기는 status 가 아니라 **code** 로 한다 — TOTAL_BUDGET_UNAVAILABLE 이 404 와 422
// 양쪽으로 오기 때문이다(docs/architecture/api-contract.md §4).
import { describe, expect, it } from "vitest";
import { ApiError, isApiError, parseApiError } from "./errors";

describe("parseApiError", () => {
  it("code · message 를 꺼낸다", () => {
    const e = parseApiError(404, { error: { code: "WEDDING_NOT_FOUND", message: "웨딩 프로필이 아직 없습니다." } });
    expect(e.code).toBe("WEDDING_NOT_FOUND");
    expect(e.status).toBe(404);
    expect(e.message).toBe("웨딩 프로필이 아직 없습니다.");
  });

  it("extra 필드를 보존한다 — BUDGET_BELOW_PAID 가 min_required 를 준다", () => {
    const e = parseApiError(400, {
      error: { code: "BUDGET_BELOW_PAID", message: "…", category_code: "VENUE", min_required: 3_000_000 },
    });
    expect(e.extra).toEqual({ category_code: "VENUE", min_required: 3_000_000 });
  });

  it("같은 code 가 다른 status 로 와도 code 는 같다 — 분기 기준이 흔들리면 안 된다", () => {
    expect(parseApiError(404, { error: { code: "TOTAL_BUDGET_UNAVAILABLE", message: "x" } }).code).toBe(
      parseApiError(422, { error: { code: "TOTAL_BUDGET_UNAVAILABLE", message: "x" } }).code,
    );
  });

  it("포맷 밖 응답도 삼키지 않는다 — code 를 지어내지 않고 status 를 남긴다", () => {
    const e = parseApiError(502, "<html>Bad Gateway</html>");
    expect(e.status).toBe(502);
    expect(e.code).toBe("UNKNOWN_ERROR");
    expect(e.message).not.toBe("");
  });

  it("포맷 밖 응답의 원본 바디를 extra.rawBody 로 보존한다 (로깅 관측성 감사, 2026-08-26)", () => {
    const e = parseApiError(502, "<html>Bad Gateway</html>");
    expect(e.extra.rawBody).toBe("<html>Bad Gateway</html>");
  });

  it("원본 바디가 길면 잘라서 보존한다", () => {
    const huge = "x".repeat(1000);
    const e = parseApiError(502, huge);
    expect(typeof e.extra.rawBody).toBe("string");
    expect((e.extra.rawBody as string).length).toBeLessThan(huge.length);
  });

  it("본문이 null 이어도 던지지 않는다", () => {
    expect(() => parseApiError(500, null)).not.toThrow();
  });
});

describe("isApiError", () => {
  it("ApiError 만 참이다", () => {
    expect(isApiError(new ApiError({ code: "X", message: "m", status: 400, extra: {} }))).toBe(true);
    expect(isApiError(new Error("보통 에러"))).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});
