// 예산을 아예 배정하지 않은(planned_budget=0) 카테고리에 지출이 생긴 경우의 회귀 테스트
// (사용자 신고, 2026-08-27) — 막대가 강제로 0%, 상단 금액도 0만원으로 보여 "아무 일도
// 안 일어난 것"처럼 보이던 버그. 이 파일 자체가 CategoryAllocationRow.tsx의 첫 테스트다.
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { WeddingCategory } from "@/entities/wedding";
import { CategoryAllocationList } from "./CategoryAllocationList";
import { CategoryAllocationRow } from "./CategoryAllocationRow";

function category(overrides: Partial<WeddingCategory>): WeddingCategory {
  return {
    category_code: "HOMENEW",
    name_ko: "혼수",
    tier: "MOCKUP",
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

const BASE_PROPS = {
  hasCost: true,
  totalBudget: 45_000_000,
  hasBenchmark: false,
  benchmark: undefined,
  isEditingScenario: false,
  originalAmount: 0,
  onDraftChange: () => {},
};

describe("CategoryAllocationRow — 보기 모드", () => {
  it("정상 범위(배정 있음, 초과 아님)에서는 기존과 동일하게 배정액과 비율을 보여준다", () => {
    const row = category({ planned_budget: 12_000_000, paid_amount: 8_000_000 });
    render(<CategoryAllocationRow category={row} {...BASE_PROPS} />);

    expect(screen.getByText("1,200만원")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "67");
    expect(screen.queryByText(/초과 지불/u)).not.toBeInTheDocument();
  });

  it("배정 있는 카테고리가 초과지출이면 막대는 100%로 클램프되고 초과분 문구가 뜬다", () => {
    const row = category({ planned_budget: 10_000_000, paid_amount: 15_000_000 });
    render(<CategoryAllocationRow category={row} {...BASE_PROPS} />);

    // 상단 금액은 여전히 배정액(1,000만원)이다 — 이 경우는 버그 케이스가 아니다.
    // 네 자리부터 콤마가 붙는다(2026-08-28) — 같은 화면의 입력칸 표기와 어긋나지 않게 한다.
    expect(screen.getByText("1,000만원")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("500만원 초과 지불")).toBeInTheDocument();
  });

  it("배정 0, 지출 0인 카테고리는 막대가 비어 있고 초과 문구도 없다(회귀 없음)", () => {
    const row = category({ planned_budget: 0, paid_amount: 0 });
    render(<CategoryAllocationRow category={row} {...BASE_PROPS} />);

    expect(screen.getByText("0만원")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.queryByText(/초과 지불/u)).not.toBeInTheDocument();
  });

  it("예산 미배정 카테고리에 지출이 생기면 막대가 채워지고 금액도 0이 아니다 — 버그 수정", () => {
    const row = category({ planned_budget: 0, paid_amount: 3_500_000 });
    render(<CategoryAllocationRow category={row} {...BASE_PROPS} />);

    // 상단 금액이 배정액(0)이 아니라 실지출액(350만원)을 보여준다 — B안(사용자 선택).
    expect(screen.getByText("350만원")).toBeInTheDocument();
    expect(screen.queryByText("0만원")).not.toBeInTheDocument();
    // 막대가 꽉 찬다 — "배정 전체가 초과"라는 뜻.
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    // 초과 문구에 회색 "예산 미배정" 보조 표기가 붙는다(사용자 지시).
    expect(screen.getByText("350만원 초과 지불")).toBeInTheDocument();
    expect(screen.getByText("- 예산 미배정")).toBeInTheDocument();
  });

  it("비용이 없는 카테고리는 기존처럼 '비용 없음'만 보여준다(회귀 없음)", () => {
    const row = category({ planned_budget: 0, paid_amount: 0 });
    render(<CategoryAllocationRow category={row} {...BASE_PROPS} hasCost={false} />);

    expect(screen.getByText("비용 없음")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

// 회귀 테스트 — 레드팀 감사 #21 "예산 페이지가 비활성 카테고리를 계속 보여준다".
// 대시보드·타임라인은 서버가 걸러 주지만(`GET /dashboard/summary`·`GET /timeline-items`),
// 이 화면이 쓰는 `GET /wedding-categories`는 9개 전체를 준다 — 거르는 건 프론트 몫이다.
//
// 거르는 주체는 `CategoryAllocationList`다(행이 아니라 목록). 그래서 이 테스트도 목록을 렌더한다.
//
// ⚠️ **질의를 예산 목록 패널 안으로 좁힌다(2026-08-29).** 같은 카드가 이제 「카테고리 사용 여부」
// 패널도 함께 마운트하고(접힌 채 `inert` — 그래야 전환 애니메이션이 돈다, 그 컴포넌트 머리말),
// 그 패널은 **비활성 카테고리를 일부러 보여준다**(다시 켜는 곳이니까). 카드 전체를 대상으로
// `queryByText` 하면 그 접힌 패널 속 이름이 잡혀, 정작 검증하려는 "예산 목록에서 걸러졌는가"를
// 못 본다.
/** 예산 목록 패널(`CategoryAllocationList` 의 `AMOUNTS_PANEL_ID`)만 잘라낸다. */
function amountsPanel() {
  const panel = document.querySelector("#budget-category-amounts");
  if (panel === null) throw new Error("예산 목록 패널을 찾지 못했습니다.");
  return within(panel as HTMLElement);
}

describe("CategoryAllocationList — 비활성 카테고리 제외", () => {
  const ACTIVE = category({ category_code: "VENUE", name_ko: "예식장", planned_budget: 12_000_000 });
  const INACTIVE = category({
    category_code: "HONEYMOON",
    name_ko: "신혼여행",
    is_active: false,
    planned_budget: 3_000_000,
    display_order: 2,
  });

  function renderList() {
    render(
      <CategoryAllocationList
        rows={[ACTIVE, INACTIVE]}
        originalCategories={[ACTIVE, INACTIVE]}
        totalBudget={30_000_000}
        hasCostByCode={new Map([["VENUE", true], ["HONEYMOON", true]])}
        hasBenchmarkByCode={new Map()}
        benchmarkByCode={new Map()}
        isEditingScenario={false}
        onDraftChange={() => {}}
        isManagingActivation={false}
        onManagingActivationChange={() => {}}
        onCategoriesSaved={() => {}}
      />,
    );
  }

  it("비활성 카테고리는 목록에 나오지 않는다", () => {
    renderList();

    expect(amountsPanel().getByText("예식장")).toBeInTheDocument();
    expect(amountsPanel().queryByText("신혼여행")).not.toBeInTheDocument();
    // 배정액(300만원)도 함께 사라진다 — 행 전체를 걸렀다는 뜻.
    expect(amountsPanel().queryByText("300만원")).not.toBeInTheDocument();
  });

  it("활성 카테고리는 진행바·금액을 그대로 보여준다(회귀 없음)", () => {
    renderList();

    expect(screen.getByText("1,200만원")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });
});
