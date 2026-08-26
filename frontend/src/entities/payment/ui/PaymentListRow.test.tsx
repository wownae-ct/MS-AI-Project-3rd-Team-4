// 수정/삭제 회귀 테스트 — patchPayment/deletePayment가 처음 실제로 쓰이는 지점(2026-08-27,
// 사용자 지시). idle→editing/deleting→saving→(idle|error) 상태 전이와, 저장/삭제 진행 중엔
// 취소가 막힌다는 것(레드팀 감사 HIGH 관례, WeddingDateEdit.tsx/BudgetDonut.tsx와 같은 이유)을
// 고정한다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Payment } from "../model";
import { PaymentListRow } from "./PaymentListRow";

const patchPaymentMock = vi.fn();
const deletePaymentMock = vi.fn();

vi.mock("../api/payment", () => ({
  patchPayment: (...args: unknown[]) => patchPaymentMock(...args),
  deletePayment: (...args: unknown[]) => deletePaymentMock(...args),
}));

function payment(overrides: Partial<Payment>): Payment {
  return {
    id: "p1",
    category_code: "VENUE",
    item_name: "본식장 잔금",
    payment_type: "BALANCE",
    vendor_name: "라온웨딩홀",
    contact_name: null,
    contact_phone: null,
    amount: 28_000_000,
    due_date: "2026-11-02",
    paid_date: null,
    status: "PLANNED",
    receipt_url: null,
    memo: null,
    ...overrides,
  };
}

beforeEach(() => {
  patchPaymentMock.mockReset();
  deletePaymentMock.mockReset();
});

describe("PaymentListRow — 보기 모드", () => {
  it("결제 유형별로 다른 배지 색 클래스를 쓴다", () => {
    render(<PaymentListRow payment={payment({ payment_type: "DEPOSIT" })} onChanged={() => {}} />);
    expect(screen.getByText("계약금").className).toContain("payment-deposit");
  });

  it("수정·삭제 버튼이 둘 다 있다", () => {
    render(<PaymentListRow payment={payment({})} onChanged={() => {}} />);
    expect(screen.getByRole("button", { name: "수정" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
  });
});

describe("PaymentListRow — 수정", () => {
  it("수정을 누르면 항목명·금액·날짜가 현재 값으로 채워진다", async () => {
    const user = userEvent.setup();
    render(<PaymentListRow payment={payment({ due_date: "2026-11-02" })} onChanged={() => {}} />);
    await user.click(screen.getByRole("button", { name: "수정" }));

    expect(screen.getByRole("textbox", { name: "항목명" })).toHaveValue("본식장 잔금");
    expect(screen.getByRole("spinbutton", { name: "금액(원)" })).toHaveValue(28_000_000);
    // PLANNED(paid_date 없음)는 예정일(due_date)을 편집 대상으로 쓴다.
    expect(screen.getByLabelText("예정일")).toHaveValue("2026-11-02");
  });

  it("PAID 건은 결제일(paid_date)을 편집 대상으로 쓴다 — 예정일이 아니다", async () => {
    const user = userEvent.setup();
    render(
      <PaymentListRow
        payment={payment({ status: "PAID", paid_date: "2026-08-20", due_date: null })}
        onChanged={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "수정" }));

    expect(screen.getByLabelText("결제일")).toHaveValue("2026-08-20");
    expect(screen.queryByLabelText("예정일")).not.toBeInTheDocument();
  });

  it("저장 성공 시 patchPayment에 수정한 값을 보내고 onChanged를 호출한다", async () => {
    const user = userEvent.setup();
    patchPaymentMock.mockResolvedValue(payment({}));
    const onChanged = vi.fn();
    render(<PaymentListRow payment={payment({ due_date: "2026-11-02" })} onChanged={onChanged} />);

    await user.click(screen.getByRole("button", { name: "수정" }));
    await user.clear(screen.getByRole("spinbutton", { name: "금액(원)" }));
    await user.type(screen.getByRole("spinbutton", { name: "금액(원)" }), "30000000");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(patchPaymentMock).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ item_name: "본식장 잔금", amount: 30_000_000, due_date: "2026-11-02" }),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("저장 중엔 취소 버튼이 막힌다 — 취소 후 완료된 저장이 값을 되살리는 것을 방지", async () => {
    const user = userEvent.setup();
    patchPaymentMock.mockImplementation(() => new Promise(() => {})); // 영구 대기 — "진행 중" 고정
    render(<PaymentListRow payment={payment({})} onChanged={() => {}} />);

    await user.click(screen.getByRole("button", { name: "수정" }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("button", { name: "저장 중…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  });

  it("빈 항목명으로 저장하면 API를 호출하지 않고 에러를 보여준다", async () => {
    const user = userEvent.setup();
    render(<PaymentListRow payment={payment({})} onChanged={() => {}} />);

    await user.click(screen.getByRole("button", { name: "수정" }));
    await user.clear(screen.getByRole("textbox", { name: "항목명" }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/모두 올바르게 입력/u);
    expect(patchPaymentMock).not.toHaveBeenCalled();
  });

  it("취소를 누르면 편집을 버리고 보기 모드로 돌아간다", async () => {
    const user = userEvent.setup();
    render(<PaymentListRow payment={payment({})} onChanged={() => {}} />);

    await user.click(screen.getByRole("button", { name: "수정" }));
    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("textbox", { name: "항목명" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수정" })).toBeInTheDocument();
  });
});

describe("PaymentListRow — 삭제", () => {
  it("삭제를 누르면 확인 문구가 뜨고, 취소하면 아무 일도 안 일어난다", async () => {
    const user = userEvent.setup();
    render(<PaymentListRow payment={payment({})} onChanged={() => {}} />);

    await user.click(screen.getByRole("button", { name: "삭제" }));
    expect(screen.getByText(/본식장 잔금.*삭제할까요/u)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(deletePaymentMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "수정" })).toBeInTheDocument();
  });

  it("삭제 확인을 누르면 deletePayment를 호출하고 onChanged를 호출한다", async () => {
    const user = userEvent.setup();
    deletePaymentMock.mockImplementation(async () => {});
    const onChanged = vi.fn();
    render(<PaymentListRow payment={payment({})} onChanged={onChanged} />);

    await user.click(screen.getByRole("button", { name: "삭제" }));
    await user.click(screen.getByRole("button", { name: "삭제" }));

    expect(deletePaymentMock).toHaveBeenCalledWith("p1");
    expect(onChanged).toHaveBeenCalled();
  });

  it("삭제 실패 시 에러 문구를 보여준다", async () => {
    const user = userEvent.setup();
    deletePaymentMock.mockRejectedValue(new Error("network"));
    render(<PaymentListRow payment={payment({})} onChanged={() => {}} />);

    await user.click(screen.getByRole("button", { name: "삭제" }));
    await user.click(screen.getByRole("button", { name: "삭제" }));

    expect(await screen.findByText("삭제하지 못했어요. 다시 시도해 주세요.")).toBeInTheDocument();
  });
});
