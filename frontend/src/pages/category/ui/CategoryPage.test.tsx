// 카테고리 상세의 **제목** 계약.
//
// 제목은 `categoryCode`(백엔드 계약값, VENUE 같은 UPPER_SNAKE_CASE)를 한국어 이름으로 바꿔
// 보여주는 자리인데, 그 이름은 `GET /categories` 가 와야 알 수 있다. 그래서 이름을 못 찾는
// 경우가 **셋**이고 셋을 같게 다루면 안 된다:
//
//   ① 아직 안 옴          → 1~2초 뒤에 이름이 올 것을 알면서 내부 식별자를 먼저 보여줄 이유가 없다
//   ② 왔는데 목록에 없음   → 사라진 코드로 딥링크가 들어온 경우. 이름은 영영 안 온다
//   ③ 조회 실패           → ②와 같다
//
// ②·③에서 일반 제목만 남기면 사용자가 **어느 카테고리를 보고 있는지 알 수 없다** — 그때는
// 내부 코드라도 있는 편이 낫다. 이 갈림을 여기서 고정한다(D14 S9 · SE1).
//
// ⚠️ ②는 지어낸 경우가 아니다. app/App.test.tsx 가 라우트 파라미터 전달을 확인할 때 정확히 이
// 경로를 탄다(getCategories 를 빈 목록으로 성공 목킹한다) — 이 폴백을 없애면 그 테스트가 검증
// 수단을 잃는다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import type { CategoryConstant, WeddingCategory } from "@/entities/wedding";
import { CategoryPage } from "./CategoryPage";

const getCategoriesMock = vi.fn();
const getWeddingCategoriesMock = vi.fn();
vi.mock("@/entities/wedding", async (orig) => ({
  ...(await orig<typeof import("@/entities/wedding")>()),
  getCategories: () => getCategoriesMock(),
  getWeddingCategories: () => getWeddingCategoriesMock(),
}));

// 활성 탭(체크리스트)이 마운트되며 조회를 건다 — 제목과 무관한 관심사라 네트워크를 끊어 둔다.
// 실제 도메인(api.test)이 존재하지 않아 DNS 실패를 기다리느라 테스트가 느려지는 것을 막는다.
vi.mock("@/entities/checklist", async (orig) => ({
  ...(await orig<typeof import("@/entities/checklist")>()),
  getChecklistItems: () => new Promise(() => {}),
}));

const VENUE: CategoryConstant = {
  code: "VENUE",
  name_ko: "예식장",
  display_order: 1,
  tier: "FOCUS",
  has_cost: true,
  has_benchmark: true,
  has_vendor_cases: false,
  allows_custom_tag: false,
};

/** `GET /wedding-categories` 의 한 행 — 이 파일은 `is_active` 만 본다. */
function weddingCategory(isActive: boolean): WeddingCategory {
  return {
    category_code: "VENUE",
    name_ko: "예식장",
    tier: "FOCUS",
    is_active: isActive,
    planned_budget: 0,
    paid_amount: 0,
    scheduled_amount: 0,
    remaining: 0,
    selected_options: null,
    display_order: 1,
    has_benchmark: true,
    has_vendor_cases: false,
  };
}

function title() {
  return screen.getByRole("heading", { level: 1 }).textContent;
}

beforeEach(() => {
  getCategoriesMock.mockReset();
  getWeddingCategoriesMock.mockReset();
  // 기본값은 "활성" — 제목 계약 테스트들은 이 분기와 무관하다. 「사용 안 함」 갈림은 아래
  // 전용 describe 가 직접 목을 세운다.
  getWeddingCategoriesMock.mockResolvedValue({ categories: [weddingCategory(true)] });
});

describe("CategoryPage 제목", () => {
  it("조회 중에는 백엔드 코드를 제목으로 내보내지 않는다", () => {
    // 끝나지 않는 조회로 로딩 상태를 붙잡아 둔다.
    getCategoriesMock.mockReturnValue(new Promise(() => {}));
    render(<CategoryPage categoryCode="VENUE" />);

    expect(title()).not.toBe("VENUE");
  });

  it("이름을 찾으면 한국어 이름을 쓴다", async () => {
    getCategoriesMock.mockResolvedValue({ categories: [VENUE] });
    render(<CategoryPage categoryCode="VENUE" />);

    expect(await screen.findByRole("heading", { level: 1, name: "예식장" })).toBeInTheDocument();
  });

  // 조회는 끝났는데 그 코드가 목록에 없다 — 이름이 영영 안 오므로 코드라도 보여준다.
  it("조회가 끝났는데 목록에 없으면 코드로 폴백한다", async () => {
    getCategoriesMock.mockResolvedValue({ categories: [] });
    render(<CategoryPage categoryCode="VENUE" />);

    expect(await screen.findByRole("heading", { level: 1, name: "VENUE" })).toBeInTheDocument();
  });

  it("조회에 실패해도 코드로 폴백한다 — 실패와 '목록에 없음'을 같게 다룬다", async () => {
    getCategoriesMock.mockRejectedValue(new Error("네트워크 실패"));
    render(<CategoryPage categoryCode="VENUE" />);

    expect(await screen.findByRole("heading", { level: 1, name: "VENUE" })).toBeInTheDocument();
  });
});

// 온보딩에서 끈 카테고리로 **직접 진입**했을 때의 갈림(2026-08-29).
//
// 대시보드의 카테고리 행은 활성만 링크로 내므로 여기 도달하는 길은 북마크·뒤로가기·주소 직접
// 입력뿐이다. 그래도 탭을 그대로 그리면 **정상 화면 모양의 빈 체크리스트**가 된다(개인화가
// 애초에 그 카테고리 항목을 만들지 않는다) — "아직 안 온 건가"와 구분되지 않는다.
//
// 🚨 판정은 **fail-open** 이어야 한다: 「행이 있고 그 `is_active` 가 false」일 때만 안내다.
// 조회 실패나 "행 없음"까지 비활성으로 취급하면, 사라진 코드로 들어온 딥링크(위 폴백 테스트가
// 지키는 그 경우)와 네트워크 실패가 전부 이 안내로 둔갑한다.
// 안내 화면만 `Link`(대시보드로 돌아가기)를 쓴다 — 라우터 컨텍스트가 없으면 렌더 자체가
// 터진다. 전체 routeTree 를 끌어오면 이 파일의 관심사(한 화면의 분기)가 라우팅 조립까지
// 넓어지므로, 이 컴포넌트만 띄우는 최소 트리를 만든다.
function renderInRouter(categoryCode: string) {
  const rootRoute = createRootRoute({ component: () => <CategoryPage categoryCode={categoryCode} /> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

describe("CategoryPage — 사용 안 함으로 설정한 카테고리", () => {
  const NOTICE = "사용 안 함으로 설정한 카테고리예요.";

  it("비활성이면 탭 대신 안내와 돌아갈 길을 낸다", async () => {
    getCategoriesMock.mockResolvedValue({ categories: [VENUE] });
    getWeddingCategoriesMock.mockResolvedValue({ categories: [weddingCategory(false)] });
    renderInRouter("VENUE");

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "대시보드로 돌아가기" })).toHaveAttribute("href", "/");
    // 탭 자체가 없다 — 체크리스트·업체사례·납부 내역 조회도 나가지 않는다는 뜻.
    expect(screen.queryByRole("tab", { name: "체크리스트" })).not.toBeInTheDocument();
  });

  it("활성이면 평소대로 탭을 그린다", async () => {
    getCategoriesMock.mockResolvedValue({ categories: [VENUE] });
    getWeddingCategoriesMock.mockResolvedValue({ categories: [weddingCategory(true)] });
    render(<CategoryPage categoryCode="VENUE" />);

    expect(await screen.findByRole("tab", { name: "체크리스트" })).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("조회에 실패하면 안내로 새지 않는다(fail-open)", async () => {
    getCategoriesMock.mockResolvedValue({ categories: [VENUE] });
    getWeddingCategoriesMock.mockRejectedValue(new Error("네트워크 실패"));
    render(<CategoryPage categoryCode="VENUE" />);

    expect(await screen.findByRole("tab", { name: "체크리스트" })).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("그 코드의 행 자체가 없으면 안내로 새지 않는다(fail-open)", async () => {
    getCategoriesMock.mockResolvedValue({ categories: [VENUE] });
    getWeddingCategoriesMock.mockResolvedValue({ categories: [] });
    render(<CategoryPage categoryCode="VENUE" />);

    expect(await screen.findByRole("tab", { name: "체크리스트" })).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
