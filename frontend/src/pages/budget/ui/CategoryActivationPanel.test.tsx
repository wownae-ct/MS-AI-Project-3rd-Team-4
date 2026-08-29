// 「카테고리 사용 여부」 패널의 **의사 결정 계약**(2026-08-29).
//
// 이 패널의 저장 한 번은 서버에서 체크리스트·타임라인 재생성을 동기로 돌린다(실측 p95 약 46초,
// 손대지 않은 항목은 삭제됨 — 그 컴포넌트 머리말). 그래서 "언제 초안이 밖으로 나가는가"가 이
// 패널의 진짜 계약이다:
//
//   ① 토글만으로는 절대 안 나간다(취소가 되돌릴 수 있어야 한다)
//   ② 확인을 통과해야 나간다
//   ③ 바뀐 게 없으면 확인창도 안 뜬다(46초를 헛돌게 하지 않는다)
//   ④ 직전 저장이 실패했으면 그때 만졌던 토글을 되살린 채 다시 시작한다
//
// **PUT 자체는 더 이상 이 패널이 보내지 않는다** — 확인 즉시 접히고 진행 표시가 목록 쪽으로
// 옮겨 갔기 때문이다(D21). 페이로드 계약은 `activation-draft.test.ts`, 대기·낙관적 반영은
// `BudgetPage.test.tsx` 가 본다.
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WeddingCategory } from "@/entities/wedding";
import type { ActivationDraft } from "./activation-draft";
import { CategoryActivationPanel } from "./CategoryActivationPanel";

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

/** 토글 → 저장 → 확인. 세 단계를 매번 적으면 정작 검증하려는 초안이 묻힌다. */
async function saveWithConfirm() {
  await userEvent.click(panelSaveButton());
  await userEvent.click(confirmButton());
}

function renderPanel(
  rows: WeddingCategory[] = [VENUE, HOMEWARE],
  extra: { error?: string | null; initialDraft?: ActivationDraft | null } = {},
) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(<CategoryActivationPanel rows={rows} onSave={onSave} onCancel={onCancel} {...extra} />);
  return { onSave, onCancel };
}

describe("CategoryActivationPanel", () => {
  it("비활성 카테고리도 행으로 보여준다 — 다시 켜는 곳이므로 거르면 안 된다", () => {
    renderPanel();

    expect(toggle("예식장")).toHaveAttribute("aria-checked", "true");
    expect(toggle("혼수")).toHaveAttribute("aria-checked", "false");
  });

  it("토글만으로는 저장하지 않는다 — 확인을 통과해야 초안이 나간다", async () => {
    const { onSave } = renderPanel();

    await userEvent.click(toggle("혼수"));
    expect(onSave).not.toHaveBeenCalled();

    await userEvent.click(panelSaveButton());
    // 확인창이 뜬 것만으로도 아직 안 나간다.
    expect(await screen.findByText("체크리스트와 타임라인을 다시 만들어요.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("확인을 통과하면 초안을 넘기고 창은 곧바로 닫힌다 — 진행 표시는 목록 쪽에 있다(D21)", async () => {
    const { onSave } = renderPanel();

    await userEvent.click(toggle("혼수"));
    await saveWithConfirm();

    expect(onSave).toHaveBeenCalledWith({ VENUE: true, HOMEWARE: true });
    expect(screen.getByRole("alertdialog", { hidden: true })).not.toHaveAttribute("open");
  });

  it("바뀐 게 없으면 확인창 없이 그냥 닫는다 — 재생성을 헛돌게 하지 않는다", async () => {
    const { onSave, onCancel } = renderPanel();

    await userEvent.click(panelSaveButton());

    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    // `ConfirmDialog` 는 네이티브 `<dialog>` 라 **닫혀 있어도 DOM 에 있다** — 본문 텍스트를
    // 찾는 것으로는 열림 여부를 알 수 없다. `showModal()` 이 세우는 `open` 속성으로 본다.
    expect(screen.getByRole("alertdialog", { hidden: true })).not.toHaveAttribute("open");
  });

  // 🚨 사용자 신고(2026-08-30) — 이 패널은 접혀도 마운트를 유지하므로(DisclosurePanel) 닫기만
  // 하면 토글 state 가 그대로 남아, 다시 열면 저장하지도 않은 토글이 켜진 채로 보였다.
  it("취소는 초안까지 되돌린다 — 다시 열었을 때 저장 안 한 토글이 남아 있으면 안 된다", async () => {
    const { onSave, onCancel } = renderPanel();

    await userEvent.click(toggle("혼수"));
    expect(toggle("혼수")).toHaveAttribute("aria-checked", "true");

    await userEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(toggle("혼수")).toHaveAttribute("aria-checked", "false");
    expect(toggle("예식장")).toHaveAttribute("aria-checked", "true");
  });

  it("이미 지불액이 있으면 예산이 남는다는 사실을 행에 적는다", async () => {
    renderPanel([category({ planned_budget: 12_000_000, paid_amount: 5_000_000 })]);

    await userEvent.click(toggle("예식장"));
    // 이 문장은 "왜 예산을 못 내리는지"의 근거라 만원 단위로 뭉개지 않는다 — 같은 카드의
    // 시세 중앙값 문구·초과 안내와 같은 `Money`(원 단위 전액) 표기다.
    expect(screen.getByText(/이미/u)).toHaveTextContent("이미 5,000,000원을 지불해 예산은 그대로 남아요.");
  });

  it("직전 저장이 실패했으면 서버 문구와 그때의 토글을 함께 되살린다", () => {
    renderPanel([VENUE, HOMEWARE], {
      error: "배정 합계가 예산을 300만원 초과합니다.",
      initialDraft: { VENUE: true, HOMEWARE: true },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("배정 합계가 예산을 300만원 초과합니다.");
    // 되돌리지 않는다 — 다시 시도할 수 있어야 한다.
    expect(toggle("혼수")).toHaveAttribute("aria-checked", "true");
  });
});
