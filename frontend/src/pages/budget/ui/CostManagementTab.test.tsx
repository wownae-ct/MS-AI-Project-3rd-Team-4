// 페이지네이션(5개씩) · 카테고리 필터 회귀 테스트(2026-08-27, 사용자 지시). 이전엔 이 파일
// 자체에 테스트가 없었다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Payment } from "@/entities/payment";
import { CostManagementTab } from "./CostManagementTab";

const getPaymentsMock = vi.fn();

vi.mock("@/entities/payment", async (orig) => ({
  ...(await orig<typeof import("@/entities/payment")>()),
  getPayments: () => getPaymentsMock(),
}));

function payment(index: number, overrides: Partial<Payment> = {}): Payment {
  return {
    id: `p${index}`,
    category_code: index % 2 === 0 ? "VENUE" : "SDM",
    item_name: `결제 항목 ${index}`,
    payment_type: "ETC",
    vendor_name: "업체",
    contact_name: null,
    contact_phone: null,
    amount: 100_000 * index,
    due_date: null,
    // 내림차순 정렬 기준(paid_date)이 항목마다 달라야 순서가 안정적이다.
    paid_date: `2026-08-${String(20 - index).padStart(2, "0")}`,
    status: "PAID",
    receipt_url: null,
    memo: null,
    ...overrides,
  };
}

const CATEGORY_LABEL_BY_CODE = new Map([
  ["VENUE", "예식장"],
  ["SDM", "스드메"],
]);
const CATEGORY_OPTIONS = [
  { code: "VENUE", name_ko: "예식장" },
  { code: "SDM", name_ko: "스드메" },
];

function renderTab() {
  return render(
    <CostManagementTab
      categoryLabelByCode={CATEGORY_LABEL_BY_CODE}
      categoryOptions={CATEGORY_OPTIONS}
      onPaymentsChanged={() => {}}
    />,
  );
}

beforeEach(() => {
  getPaymentsMock.mockReset();
});

describe("CostManagementTab — 페이지네이션(5개씩)", () => {
  it("6개 이상이면 첫 페이지엔 5개만 보이고 페이지 컨트롤이 뜬다", async () => {
    getPaymentsMock.mockResolvedValue({ payments: Array.from({ length: 7 }, (_, i) => payment(i + 1)) });
    renderTab();

    // index가 작을수록 paid_date가 더 최근이라(payment() 픽스처 참고) 정렬 1위는 "결제 항목 1".
    expect(await screen.findByText("결제 항목 1")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    // 가장 오래된 두 건(6·7)은 2페이지에 있어 1페이지엔 안 보인다.
    expect(screen.queryByText("결제 항목 6")).not.toBeInTheDocument();
    expect(screen.queryByText("결제 항목 7")).not.toBeInTheDocument();
  });

  it("5개 이하면 페이지 컨트롤 자체가 안 뜬다", async () => {
    getPaymentsMock.mockResolvedValue({ payments: Array.from({ length: 3 }, (_, i) => payment(i + 1)) });
    renderTab();

    await screen.findByText("결제 항목 3");
    expect(screen.queryByText(/^1 \//u)).not.toBeInTheDocument();
  });

  it("다음 버튼을 누르면 다음 5개가 보인다", async () => {
    const user = userEvent.setup();
    getPaymentsMock.mockResolvedValue({ payments: Array.from({ length: 7 }, (_, i) => payment(i + 1)) });
    renderTab();

    await screen.findByText("1 / 2");
    await user.click(screen.getByRole("button", { name: /다음/u }));

    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("CostManagementTab — 카테고리 필터", () => {
  it("필터를 바꾸면 해당 카테고리만 남고 1페이지로 리셋된다", async () => {
    const user = userEvent.setup();
    // VENUE 6개(2페이지 필요) + SDM 1개 — 필터 전 목록은 다 섞여 여러 페이지에 걸쳐 있다.
    getPaymentsMock.mockResolvedValue({
      payments: [
        ...Array.from({ length: 6 }, (_, i) => payment(i + 1, { category_code: "VENUE" })),
        payment(7, { category_code: "SDM", item_name: "스드메 단독 항목" }),
      ],
    });
    renderTab();

    await screen.findByText("1 / 2");
    await user.click(screen.getByRole("button", { name: /다음/u })); // 2페이지로 이동해 둔다
    await screen.findByText("2 / 2");

    await user.click(screen.getByRole("combobox", { name: "카테고리 필터" }));
    await user.click(screen.getByRole("option", { name: "스드메" }));

    // 필터 변경으로 1페이지로 리셋되고, SDM 카테고리 1건만 남는다(페이지 컨트롤도 사라진다).
    expect(await screen.findByText("스드메 단독 항목")).toBeInTheDocument();
    expect(screen.queryByText(/^\d \/ \d/u)).not.toBeInTheDocument();
  });

  it("해당 카테고리에 내역이 없으면 전용 안내 문구를 보여준다", async () => {
    const user = userEvent.setup();
    getPaymentsMock.mockResolvedValue({ payments: [payment(1, { category_code: "VENUE" })] });
    renderTab();

    await screen.findByText("결제 항목 1");
    await user.click(screen.getByRole("combobox", { name: "카테고리 필터" }));
    await user.click(screen.getByRole("option", { name: "스드메" }));

    expect(await screen.findByText("이 카테고리엔 등록된 납부 내역이 없습니다.")).toBeInTheDocument();
  });
});

// 정렬 규칙 자체는 `sort-payments.test.ts`가 단위로 고정한다. 여기서 고정하는 것은 **이 화면이
// 그 정렬을 실제로 태우는가** — 특히 5개씩 페이지네이션되므로 "1페이지 맨 위에 무엇이 오는가"가
// 사용자가 보는 전부다(2026-08-29, 사용자 지시로 「최근 활동순」 → 「예정일 기준」).
describe("CostManagementTab — 기본 정렬(예정일 기준)", () => {
  it("1페이지 맨 위는 가장 임박한 미납 건이고, 끝난 건은 그 뒤로 밀린다", async () => {
    getPaymentsMock.mockResolvedValue({
      payments: [
        // 응답 순서를 일부러 뒤섞는다 — 서버는 정렬을 보장하지 않는다.
        payment(1, { item_name: "지난 계약금", status: "PAID", due_date: null, paid_date: "2026-03-10" }),
        payment(2, { item_name: "먼 잔금", status: "PLANNED", due_date: "2026-11-02", paid_date: null }),
        payment(3, { item_name: "임박한 중도금", status: "PLANNED", due_date: "2026-09-15", paid_date: null }),
        payment(4, { item_name: "최근 계약금", status: "PAID", due_date: null, paid_date: "2026-07-01" }),
      ],
    });
    renderTab();

    await screen.findByText("임박한 중도금");
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");

    expect(rows[0]).toContain("임박한 중도금");
    expect(rows[1]).toContain("먼 잔금");
    expect(rows[2]).toContain("최근 계약금");
    expect(rows[3]).toContain("지난 계약금");
  });
});
