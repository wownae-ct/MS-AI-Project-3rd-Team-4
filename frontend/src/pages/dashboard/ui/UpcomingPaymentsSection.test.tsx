// "다가오는 납부" 위젯의 **세 상태** 계약 — 로딩 · 성공 · 실패.
//
// 왜 이 파일이 생겼나: 예전엔 상태가 둘뿐이었다(데이터 있음 / 없으면 아무것도 안 그림).
// 그래서 조회 실패가 **화면에 전혀 드러나지 않았고**, 대신 카드가 뒤늦게 끼어들며 아래 내용을
// 밀어냈다. 로딩 중 자리를 잡아 그 밀림을 없애는 순간 **실패를 따로 알아야 한다** — 안 그러면
// 조용하던 실패가 영원히 남는 자리표시로 바뀐다(D14 SE2). 이 셋을 여기서 고정한다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { UpcomingPaymentsSection } from "./UpcomingPaymentsSection";

const getUpcomingPaymentsMock = vi.fn();
vi.mock("@/entities/payment", async (orig) => ({
  ...(await orig<typeof import("@/entities/payment")>()),
  getUpcomingPayments: () => getUpcomingPaymentsMock(),
}));

beforeEach(() => {
  getUpcomingPaymentsMock.mockReset();
});

describe("UpcomingPaymentsSection", () => {
  it("조회 중엔 자리를 잡는다 — 카드가 뒤늦게 끼어들며 아래를 밀어내지 않게", () => {
    // 끝나지 않는 조회로 로딩 상태를 붙잡아 둔다.
    getUpcomingPaymentsMock.mockReturnValue(new Promise(() => {}));
    render(<UpcomingPaymentsSection />);

    expect(screen.getByRole("heading", { level: 2, name: "다가오는 납부" })).toBeInTheDocument();
  });

  it("조회에 실패하면 자리를 회수한다 — 영구 자리표시를 남기지 않는다", async () => {
    getUpcomingPaymentsMock.mockRejectedValue(new Error("네트워크 실패"));
    render(<UpcomingPaymentsSection />);

    // 보조 위젯이라 에러 배너는 띄우지 않는다 — 조용히 사라지는 기존 정책을 유지한다.
    await waitFor(() => {
      expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    });
  });

  it("조회에 성공하면 실제 카드를 그린다", async () => {
    getUpcomingPaymentsMock.mockResolvedValue({
      days: 30,
      payments: [
        {
          id: "p1",
          category_code: "VENUE",
          item_name: "예식장 중도금",
          amount: 4_200_000,
          due_date: "2026-09-01",
          d_day: 25,
        },
      ],
    });
    render(<UpcomingPaymentsSection />);

    // 정규식으로 찾는다 — 행이 D-day·구분점·항목명을 한 요소 안에 나눠 담아서
    // (UpcomingPaymentsCard) 완전일치 문자열로는 잡히지 않는다.
    expect(await screen.findByText(/예식장 중도금/u)).toBeInTheDocument();
  });
});
