// 「카테고리 사용 여부」 패널의 **저장 계약**(2026-08-29).
//
// 이 패널의 저장 한 번은 서버에서 체크리스트·타임라인 재생성을 동기로 돌린다(실측 p95 약 46초,
// 손대지 않은 항목은 삭제됨 — 그 컴포넌트 머리말). 그래서 "언제 PUT 이 나가는가"와 "무엇을
// 실어 보내는가"가 이 화면의 진짜 계약이다:
//
//   ① 토글만으로는 절대 안 나간다(취소가 되돌릴 수 있어야 한다)
//   ② 확인을 통과해야 나간다
//   ③ 바뀐 게 없으면 확인창도 안 뜬다(46초를 헛돌게 하지 않는다)
//   ④ 끄는 카테고리의 예산은 0 으로 — **단 이미 지불액이 있으면 못 내린다**(400 BUDGET_BELOW_PAID)
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WeddingCategory } from "@/entities/wedding";
import { CategoryActivationPanel } from "./CategoryActivationPanel";

const putWeddingCategoriesMock = vi.fn();
vi.mock("@/entities/wedding", async (orig) => ({
  ...(await orig<typeof import("@/entities/wedding")>()),
  putWeddingCategories: (...args: unknown[]) => putWeddingCategoriesMock(...args),
}));

function category(overrides: Partial<WeddingCategory> = {}): WeddingCategory {
  return {
    category_code: "VENUE",
    name_ko: "예식장",
    tier: "FOCUS",
    is_active: true,
    planned_budget: 0,
    paid_amount: 0,
    scheduled_amount: 0,
    remaining: 0,
    selected_options: null,
    display_order: 1,
    has_benchmark: false,
    has_vendor_cases: false,
    ...overrides,
  };
}

const VENUE = category();
const HOMEWARE = category({
  category_code: "HOMEWARE",
  name_ko: "혼수",
  is_active: false,
  display_order: 2,
  selected_options: ["가전"],
});

function toggle(name: string) {
  return screen.getByRole("switch", { name: `${name} 카테고리 사용 여부` });
}

/** 패널 자신의 "저장". 확인창이 열리면 같은 이름의 버튼이 둘이 되므로 창 밖으로 좁힌다. */
function panelSaveButton() {
  const button = screen
    .getAllByRole("button", { name: "저장" })
    .find((el) => el.closest("[role='alertdialog']") === null);
  expect(button).toBeDefined();
  return button as HTMLElement;
}

/** 확인창의 실행 버튼. `ConfirmDialog` 는 `role="alertdialog"` 다. */
function confirmButton() {
  return within(screen.getByRole("alertdialog")).getByRole("button", { name: "저장" });
}

/** 토글 → 저장 → 확인. 세 단계를 매번 적으면 정작 검증하려는 payload 가 묻힌다. */
async function saveWithConfirm() {
  await userEvent.click(panelSaveButton());
  await userEvent.click(confirmButton());
}

function renderPanel(rows: WeddingCategory[] = [VENUE, HOMEWARE], onSaved = vi.fn(), onCancel = vi.fn()) {
  render(<CategoryActivationPanel rows={rows} onSaved={onSaved} onCancel={onCancel} />);
  return { onSaved, onCancel };
}

beforeEach(() => {
  vi.clearAllMocks();
  putWeddingCategoriesMock.mockResolvedValue({ categories: [] });
});

describe("CategoryActivationPanel", () => {
  it("비활성 카테고리도 행으로 보여준다 — 다시 켜는 곳이므로 거르면 안 된다", () => {
    renderPanel();

    expect(toggle("예식장")).toHaveAttribute("aria-checked", "true");
    expect(toggle("혼수")).toHaveAttribute("aria-checked", "false");
  });

  it("토글만으로는 저장하지 않는다 — 확인을 통과해야 PUT 이 나간다", async () => {
    renderPanel();

    await userEvent.click(toggle("혼수"));
    expect(putWeddingCategoriesMock).not.toHaveBeenCalled();

    await userEvent.click(panelSaveButton());
    // 확인창이 뜬 것만으로도 아직 안 나간다.
    expect(await screen.findByText("체크리스트와 타임라인을 다시 만들어요.")).toBeInTheDocument();
    expect(putWeddingCategoriesMock).not.toHaveBeenCalled();
  });

  it("바뀐 게 없으면 확인창 없이 그냥 닫는다 — 재생성을 헛돌게 하지 않는다", async () => {
    const { onCancel } = renderPanel();

    await userEvent.click(panelSaveButton());

    expect(onCancel).toHaveBeenCalled();
    expect(putWeddingCategoriesMock).not.toHaveBeenCalled();
    // `ConfirmDialog` 는 네이티브 `<dialog>` 라 **닫혀 있어도 DOM 에 있다** — 본문 텍스트를
    // 찾는 것으로는 열림 여부를 알 수 없다. `showModal()` 이 세우는 `open` 속성으로 본다.
    expect(screen.getByRole("alertdialog", { hidden: true })).not.toHaveAttribute("open");
  });

  it("켤 때는 9개 전체를 보내고, 만지지 않은 필드는 조회값 그대로 되돌려 보낸다", async () => {
    const { onSaved } = renderPanel();
    putWeddingCategoriesMock.mockResolvedValue({ categories: [VENUE] });

    await userEvent.click(toggle("혼수"));
    await saveWithConfirm();

    // PUT 은 부분 갱신이 아니다 — 두 행 다 실려야 한다.
    expect(putWeddingCategoriesMock).toHaveBeenCalledWith([
      {
        category_code: "VENUE",
        is_active: true,
        planned_budget: 0,
        selected_options: null,
        display_order: 1,
      },
      {
        category_code: "HOMEWARE",
        is_active: true,
        planned_budget: 0,
        // 이 패널이 만지지 않는 필드 — 지우면 온보딩에서 고른 하위 옵션이 조용히 사라진다.
        selected_options: ["가전"],
        display_order: 2,
      },
    ]);
    expect(onSaved).toHaveBeenCalledWith([VENUE]);
  });

  // 서버의 초과 검증은 is_active 무관 9개 전체 합이라(services/wedding.py) 끄면서 금액을
  // 남기면 "화면엔 그 행이 없는데 초과" 상태가 만들어진다.
  it("끄는 카테고리의 예산은 0 으로 민다", async () => {
    renderPanel([category({ planned_budget: 12_000_000 })]);

    await userEvent.click(toggle("예식장"));
    await saveWithConfirm();

    expect(putWeddingCategoriesMock.mock.calls[0][0][0]).toMatchObject({
      is_active: false,
      planned_budget: 0,
    });
  });

  // planned_budget < paid_amount 는 400 BUDGET_BELOW_PAID 다 — 0 으로 밀면 저장 자체가 막힌다.
  it("이미 지불액이 있으면 예산을 그대로 두고, 그 이유를 행에 적는다", async () => {
    renderPanel([category({ planned_budget: 12_000_000, paid_amount: 5_000_000 })]);

    await userEvent.click(toggle("예식장"));
    // 이 문장은 "왜 예산을 못 내리는지"의 근거라 만원 단위로 뭉개지 않는다 — 같은 카드의
    // 시세 중앙값 문구·초과 안내와 같은 `Money`(원 단위 전액) 표기다.
    expect(screen.getByText(/이미/u)).toHaveTextContent("이미 5,000,000원을 지불해 예산은 그대로 남아요.");

    await saveWithConfirm();

    expect(putWeddingCategoriesMock.mock.calls[0][0][0]).toMatchObject({
      is_active: false,
      planned_budget: 12_000_000,
    });
  });

  it("저장에 실패하면 서버 문구를 그대로 보여주고 패널에 머문다", async () => {
    const { onSaved } = renderPanel();
    const { ApiError } = await import("@/shared/api");
    putWeddingCategoriesMock.mockRejectedValue(
      new ApiError({ code: "BUDGET_EXCEEDED", message: "배정 합계가 예산을 300만원 초과합니다.", status: 400, extra: {} }),
    );

    await userEvent.click(toggle("혼수"));
    await saveWithConfirm();

    expect(await screen.findByRole("alert")).toHaveTextContent("배정 합계가 예산을 300만원 초과합니다.");
    expect(onSaved).not.toHaveBeenCalled();
    expect(toggle("혼수")).toHaveAttribute("aria-checked", "true"); // 되돌리지 않는다 — 다시 시도할 수 있어야 한다.
  });
});
