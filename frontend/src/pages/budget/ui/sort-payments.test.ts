// 「비용 관리」 기본 정렬 계약 (2026-08-29, 사용자 지시).
//
// 규칙과 근거는 `sort-payments.ts` 머리말. 여기서 고정하는 것은 **조용히 틀려도 화면이 그럴듯해
// 보이는** 지점들이다 — 특히 `due_date: null` 이 목록 맨 앞을 차지하는 사고(빈 문자열이 사전식으로
// 가장 앞이라 종전 `?? ""` 방식이 그랬다)와, 서버 응답 순서에 기대는 tie-break.
import { describe, expect, it } from "vitest";
import type { Payment } from "@/entities/payment";
import { sortPaymentsByDueDate } from "./sort-payments";

function payment(id: string, overrides: Partial<Payment> = {}): Payment {
  return {
    id,
    category_code: "VENUE",
    item_name: id,
    payment_type: "ETC",
    vendor_name: "업체",
    contact_name: null,
    contact_phone: null,
    amount: 1_000_000,
    due_date: null,
    paid_date: null,
    status: "PLANNED",
    receipt_url: null,
    memo: null,
    ...overrides,
  };
}

const ids = (payments: readonly Payment[]) => payments.map((p) => p.id);

describe("sortPaymentsByDueDate", () => {
  it("아직 안 낸 건이 끝난 건보다 앞에 온다", () => {
    const done = payment("done", { status: "PAID", paid_date: "2026-12-31" });
    const pending = payment("pending", { due_date: "2026-01-01" });

    // 끝난 건의 날짜가 훨씬 미래여도 그룹이 우선이다.
    expect(ids(sortPaymentsByDueDate([done, pending]))).toEqual(["pending", "done"]);
  });

  it("안 낸 건은 예정일 오름차순 — 임박한 것이 위로", () => {
    const later = payment("later", { due_date: "2026-11-02" });
    const soon = payment("soon", { due_date: "2026-09-15" });
    const middle = payment("middle", { due_date: "2026-10-20" });

    expect(ids(sortPaymentsByDueDate([later, soon, middle]))).toEqual(["soon", "middle", "later"]);
  });

  // 🚨 종전 방식(`?? ""`)이 정확히 여기서 틀렸다 — 빈 문자열이 사전식으로 가장 앞이라
  // 예정일 없는 건이 「가장 임박한 결제」 자리를 차지했다.
  it("예정일이 없는 미납 건은 맨 앞이 아니라 미납 그룹 맨 뒤로 간다", () => {
    const noDate = payment("no-date", { due_date: null });
    const dated = payment("dated", { due_date: "2026-09-15" });
    const done = payment("done", { status: "PAID", paid_date: "2026-08-01" });

    expect(ids(sortPaymentsByDueDate([noDate, done, dated]))).toEqual(["dated", "no-date", "done"]);
  });

  it("끝난 건은 최근 순 — 종전 규칙(paid_date ?? due_date 내림차순) 그대로다", () => {
    const old = payment("old", { status: "PAID", paid_date: "2026-03-10" });
    const recent = payment("recent", { status: "PAID", paid_date: "2026-07-01" });
    // paid_date 가 없으면 due_date 로 떨어진다 — 종전 식과 동일.
    const byDueDate = payment("by-due-date", { status: "PAID", paid_date: null, due_date: "2026-05-02" });

    expect(ids(sortPaymentsByDueDate([old, byDueDate, recent]))).toEqual(["recent", "by-due-date", "old"]);
  });

  it("취소된 건은 「낼 돈」이 아니므로 끝난 그룹에 있다", () => {
    const canceled = payment("canceled", { status: "CANCELED", paid_date: "2026-12-31" });
    const pending = payment("pending", { due_date: "2026-11-02" });

    expect(ids(sortPaymentsByDueDate([canceled, pending]))).toEqual(["pending", "canceled"]);
  });

  // 서버는 정렬을 보장하지 않는다 — 같은 날짜 두 건(예: 본식 당일 잔금 2건)이 재조회마다
  // 자리를 바꾸면 안 된다.
  it("날짜가 같으면 id로 순서를 고정한다 — 입력 순서가 달라도 결과가 같다", () => {
    const a = payment("a", { due_date: "2026-11-02" });
    const b = payment("b", { due_date: "2026-11-02" });

    expect(ids(sortPaymentsByDueDate([a, b]))).toEqual(["a", "b"]);
    expect(ids(sortPaymentsByDueDate([b, a]))).toEqual(["a", "b"]);
  });

  it("예정일 없는 미납 건끼리도 id로 고정된다", () => {
    const a = payment("a");
    const b = payment("b");

    expect(ids(sortPaymentsByDueDate([b, a]))).toEqual(["a", "b"]);
  });

  it("원본 배열을 변형하지 않는다", () => {
    const input = [payment("late", { due_date: "2026-11-02" }), payment("early", { due_date: "2026-09-15" })];

    sortPaymentsByDueDate(input);

    expect(ids(input)).toEqual(["late", "early"]);
  });

  it("빈 목록도 안전하다", () => {
    expect(sortPaymentsByDueDate([])).toEqual([]);
  });
});
