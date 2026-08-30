// 수정/삭제 회귀 테스트 — patchPayment/deletePayment가 처음 실제로 쓰이는 지점(2026-08-27,
// 사용자 지시). idle→editing/deleting→saving→(idle|error) 상태 전이와, 저장/삭제 진행 중엔
// 취소가 막힌다는 것(레드팀 감사 HIGH 관례, WeddingDateEdit.tsx/BudgetDonut.tsx와 같은 이유)을
// 고정한다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// ⚠️ [2026-08-30] 오늘 날짜를 `new Date().toISOString().slice(0,10)` 으로 계산하고 있었다 —
// **D20 이 앱에서 지운 바로 그 UTC 버그**다(`shared/lib/date.ts` 의 `todayISO` 가 그 자리를
// 대신한다). 컴포넌트는 `todayISO()`(KST)를 쓰는데 테스트만 UTC 로 재고 있어서, **KST
// 00:00~08:59 에만** 하루가 어긋나 두 케이스가 깨졌다(그 시간대에 실제로 깨져서 발견했다).
// 계산을 앱과 같은 함수로 통일한다 — 시각에 따라 결과가 갈리는 테스트를 남기지 않는다.
import { formatKorean, todayISO } from "@/shared/lib/date";
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

// [2026-08-30] 날짜 칸은 더 이상 텍스트 입력이 아니다 — 값을 이고 다니는 **트리거 버튼**이고,
// 값을 만드는 길은 캘린더뿐이다(`shared/ui/DateField.tsx` 머리말 §개정). 접근명이
// `"예정일, 2026년 11월 2일 (월)"` 꼴이라 라벨 완전일치로는 잡히지 않는다.
const dateNameOf = (label: string) => new RegExp(`^${label},`, "u");
const dateField = (label: string) => screen.getByRole("button", { name: dateNameOf(label) });
const queryDateField = (label: string) => screen.queryByRole("button", { name: dateNameOf(label) });

beforeEach(() => {
  patchPaymentMock.mockReset();
  deletePaymentMock.mockReset();
});

describe("PaymentListRow — 보기 모드", () => {
  it("결제 유형별로 다른 배지 색 클래스를 쓴다", () => {
    render(<PaymentListRow payment={payment({ payment_type: "DEPOSIT" })} onChanged={() => {}} />);
    expect(screen.getByText("계약금").className).toContain("payment-deposit");
  });

  // D17 — 한 줄에 배지가 둘 붙는 유일한 자리다. 색(값)만이 아니라 **형태(계열)** 도 갈려야 한다:
  // 결제 유형은 테두리, 카테고리는 채움. 둘 다 채움이 되면 어느 쪽이 무슨 축인지 흐려진다.
  it("결제 유형 배지는 테두리 변이, 카테고리 배지는 채움 변이다", () => {
    render(<PaymentListRow payment={payment({})} categoryLabel="예식장" onChanged={() => {}} />);
    const paymentTypeBadge = screen.getByText("잔금");
    expect(paymentTypeBadge.className).toContain("border-current");
    expect(paymentTypeBadge.className).not.toContain("bg-payment");

    const categoryBadge = screen.getByText("예식장");
    expect(categoryBadge.className).not.toContain("border-current");
    expect(categoryBadge.className).toContain("bg-category-venue-soft");
  });

  // 색은 표시 이름(categoryLabel)이 아니라 category_code 로 고른다 — 서버가 표시 문구를 바꿔도
  // 색이 조용히 바뀌지 않아야 한다.
  it("카테고리 배지 색은 표시 이름이 아니라 category_code 로 고른다", () => {
    render(<PaymentListRow payment={payment({ category_code: "SDM" })} categoryLabel="아무 이름" onChanged={() => {}} />);
    expect(screen.getByText("아무 이름").className).toContain("category-sdm");
  });

  // 백엔드가 10번째 카테고리를 추가해도 색을 지어내지 않고 기본 배지로 떨어진다.
  it("모르는 category_code 는 기본 배지(primary 채움)로 떨어진다", () => {
    render(<PaymentListRow payment={payment({ category_code: "NEW_ONE" })} categoryLabel="새 카테고리" onChanged={() => {}} />);
    const badge = screen.getByText("새 카테고리");
    expect(badge.className).toContain("bg-primary-soft");
    expect(badge.className).not.toContain("bg-category");
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
    // 값은 콤마가 붙은 표시 문자열이다(2026-08-28) — 실제 값은 저장 시 콤마 없는 정수로 나간다.
    expect(screen.getByRole("spinbutton", { name: "금액(원)" })).toHaveValue("28,000,000");
    // PLANNED(paid_date 없음)는 예정일(due_date)을 편집 대상으로 쓴다.
    expect(dateField("예정일")).toHaveTextContent(formatKorean("2026-11-02"));
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

    expect(dateField("결제일")).toHaveTextContent(formatKorean("2026-08-20"));
    expect(queryDateField("예정일")).not.toBeInTheDocument();
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

describe("PaymentListRow — 상태 전환(PLANNED→PAID)", () => {
  it("PLANNED 건만 '이미 결제했어요' 토글이 보인다 — PAID 건엔 없다", async () => {
    const user = userEvent.setup();
    render(<PaymentListRow payment={payment({ status: "PAID", paid_date: "2026-08-20" })} onChanged={() => {}} />);
    await user.click(screen.getByRole("button", { name: "수정" }));

    expect(screen.queryByLabelText("이미 결제했어요")).not.toBeInTheDocument();
  });

  it("토글을 켜면 날짜 라벨이 예정일→결제일로 바뀌고 오늘 날짜로 채워진다", async () => {
    const user = userEvent.setup();
    render(<PaymentListRow payment={payment({ due_date: "2026-11-02" })} onChanged={() => {}} />);
    await user.click(screen.getByRole("button", { name: "수정" }));
    await user.click(screen.getByLabelText("이미 결제했어요"));

    expect(queryDateField("예정일")).not.toBeInTheDocument();
    const today = todayISO();
    expect(dateField("결제일")).toHaveTextContent(formatKorean(today));
    expect(screen.getByText("저장하면 「지급완료」로 바뀝니다.")).toBeInTheDocument();
  });

  it("저장 시 status 없이 paid_date만 보낸다 — 서버 자동유도(dd435d1) 계약", async () => {
    const user = userEvent.setup();
    patchPaymentMock.mockResolvedValue(payment({}));
    render(<PaymentListRow payment={payment({ due_date: "2026-11-02" })} onChanged={() => {}} />);
    await user.click(screen.getByRole("button", { name: "수정" }));
    await user.click(screen.getByLabelText("이미 결제했어요"));
    await user.click(screen.getByRole("button", { name: "저장" }));

    const today = todayISO();
    expect(patchPaymentMock).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ paid_date: today }),
    );
    const [, sentPatch] = patchPaymentMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(sentPatch.status).toBeUndefined();
    expect(sentPatch.due_date).toBeUndefined();
  });

  it("토글을 다시 끄면 예정일로 되돌아간다", async () => {
    const user = userEvent.setup();
    render(<PaymentListRow payment={payment({ due_date: "2026-11-02" })} onChanged={() => {}} />);
    await user.click(screen.getByRole("button", { name: "수정" }));
    await user.click(screen.getByLabelText("이미 결제했어요"));
    await user.click(screen.getByLabelText("이미 결제했어요"));

    expect(dateField("예정일")).toHaveTextContent(formatKorean("2026-11-02"));
  });
});

describe("PaymentListRow — 상태 전환(PAID→CANCELED, 환불)", () => {
  it("PAID 건만 '환불 처리(취소)' 토글이 보인다 — PLANNED 건엔 없다", async () => {
    const user = userEvent.setup();
    render(<PaymentListRow payment={payment({})} onChanged={() => {}} />);
    await user.click(screen.getByRole("button", { name: "수정" }));

    expect(screen.queryByLabelText("환불 처리(취소)")).not.toBeInTheDocument();
  });

  it("토글을 켜면 날짜 입력이 잠기고, 저장 시 status: CANCELED를 명시적으로 보낸다", async () => {
    const user = userEvent.setup();
    patchPaymentMock.mockResolvedValue(payment({}));
    render(
      <PaymentListRow payment={payment({ status: "PAID", paid_date: "2026-08-20" })} onChanged={() => {}} />,
    );
    await user.click(screen.getByRole("button", { name: "수정" }));
    await user.click(screen.getByLabelText("환불 처리(취소)"));

    expect(dateField("결제일")).toBeDisabled();
    expect(screen.getByText("저장하면 「취소됨」으로 바뀌고 총 지불액에서 빠집니다.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(patchPaymentMock).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ status: "CANCELED", paid_date: "2026-08-20" }),
    );
  });
});

describe("PaymentListRow — 삭제", () => {
  it("PAID 건 삭제 확인엔 총 지불액에서 빠진다는 안내가 붙는다", async () => {
    const user = userEvent.setup();
    render(
      <PaymentListRow payment={payment({ status: "PAID", paid_date: "2026-08-20" })} onChanged={() => {}} />,
    );
    await user.click(screen.getByRole("button", { name: "삭제" }));

    expect(screen.getByText(/총 지불액에서도 빠집니다/u)).toBeInTheDocument();
  });

  it("PLANNED 건 삭제 확인엔 예산에 영향 없다는 안내가 붙는다", async () => {
    const user = userEvent.setup();
    render(<PaymentListRow payment={payment({})} onChanged={() => {}} />);
    await user.click(screen.getByRole("button", { name: "삭제" }));

    expect(screen.getByText("아직 안 낸 항목이라 예산 금액엔 영향 없어요.")).toBeInTheDocument();
  });

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
