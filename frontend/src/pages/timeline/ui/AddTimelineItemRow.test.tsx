// 회귀 테스트 — 「+ 항목 추가」가 **비활성 카테고리를 선택지로 내던** 조용한 데이터 유실
// (2026-08-29).
//
// ## 무엇이 회귀인가
//
// 이 폼은 예전에 스스로 `GET /categories`(전역 상수 9개)를 불러 그대로 옵션으로 냈다. 그 응답엔
// `is_active` 가 없어 **온보딩에서 끈 카테고리도 고를 수 있었고**, 그렇게 만든 항목은
// `POST /timeline-items` 가 201 로 성공하지만(서버는 카테고리 존재 여부만 검사한다)
// 뒤이은 `GET /timeline-items` 가 비활성 카테고리 항목을 걸러(`03_API_spec.md` #15)
// **목록에 끝내 나타나지 않는다** — "추가했어요" 안내까지 떴다.
//
// 이제 거르는 책임은 호출부(`TimelinePage`)에 있고 이 폼은 받은 목록을 그대로 그린다.
// 그래서 이 파일은 **폼이 목록을 스스로 만들지 않는다**는 것과 **고른 값이 그대로 나간다**는
// 두 가지만 본다 — 어느 카테고리가 활성인지는 TimelinePage.test 의 몫이다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddTimelineItemRow } from "./AddTimelineItemRow";

const createTimelineItemMock = vi.fn();
vi.mock("@/entities/timeline", async (orig) => ({
  ...(await orig<typeof import("@/entities/timeline")>()),
  createTimelineItem: (...args: unknown[]) => createTimelineItemMock(...args),
}));

// 🚨 이 감시자가 이 파일의 핵심이다 — 폼이 카테고리 목록을 **스스로 조회하는 순간** 호출부의
// 필터를 우회하게 되고, 그러면 위 유실이 그대로 되살아난다.
const getCategoriesMock = vi.fn();
vi.mock("@/entities/wedding", async (orig) => ({
  ...(await orig<typeof import("@/entities/wedding")>()),
  getCategories: () => getCategoriesMock(),
}));

const OPTIONS = [
  { code: "VENUE", name_ko: "예식장" },
  { code: "SDM", name_ko: "스드메" },
];

beforeEach(() => {
  vi.clearAllMocks();
  createTimelineItemMock.mockResolvedValue({});
  getCategoriesMock.mockResolvedValue({ categories: [] });
});

async function openForm() {
  render(<AddTimelineItemRow categoryOptions={OPTIONS} onAdded={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "+ 항목 추가" }));
}

describe("AddTimelineItemRow — 카테고리 선택지", () => {
  it("넘겨받은 목록만 낸다 — 카테고리 상수를 스스로 조회하지 않는다", async () => {
    await openForm();

    const options = screen.getAllByRole("option").map((el) => el.textContent);
    expect(options).toEqual(["카테고리 무관", "예식장", "스드메"]);
    expect(getCategoriesMock).not.toHaveBeenCalled();
  });

  it("목록이 비어도 '카테고리 무관'으로 계속 추가할 수 있다", async () => {
    render(<AddTimelineItemRow categoryOptions={[]} onAdded={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "+ 항목 추가" }));

    expect(screen.getAllByRole("option").map((el) => el.textContent)).toEqual(["카테고리 무관"]);
  });

  it("고른 카테고리가 그대로 POST 로 나간다", async () => {
    await openForm();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "카테고리" }), "SDM");
    await userEvent.type(screen.getByRole("textbox", { name: "항목 이름" }), "드레스 투어");
    await userEvent.type(screen.getByRole("textbox", { name: "날짜" }), "2027-01-15");
    await userEvent.click(screen.getByRole("button", { name: "추가" }));

    expect(createTimelineItemMock).toHaveBeenCalledWith({
      category_code: "SDM",
      title: "드레스 투어",
      target_date: "2027-01-15",
    });
  });

  it("고르지 않으면 category_code 는 null 이다 — 혼인신고처럼 카테고리 무관 항목이 실제로 있다", async () => {
    await openForm();

    await userEvent.type(screen.getByRole("textbox", { name: "항목 이름" }), "혼인신고");
    await userEvent.type(screen.getByRole("textbox", { name: "날짜" }), "2027-01-15");
    await userEvent.click(screen.getByRole("button", { name: "추가" }));

    expect(createTimelineItemMock).toHaveBeenCalledWith({
      category_code: null,
      title: "혼인신고",
      target_date: "2027-01-15",
    });
  });
});
