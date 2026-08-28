// 체크리스트 근거 배지 — entities/chat/ui/MessageBubble.test.tsx와 같은 계약(dev-e4 요청,
// 백엔드 feature/backend-checklist-citation-grounding: LLM 생성 경로도 CONTRACT_TERM 항목에
// source_tier/source_label/source_url을 채운다, API 스키마 변경 없음).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChecklistItem } from "@/entities/checklist";
import type { CategoryConstant } from "@/entities/wedding";
import { ChecklistTab } from "./ChecklistTab";

const getChecklistItemsMock = vi.fn();
vi.mock("@/entities/checklist", async (orig) => ({
  ...(await orig<typeof import("@/entities/checklist")>()),
  getChecklistItems: () => getChecklistItemsMock(),
}));

// has_vendor_cases: false 로 두어 이 테스트 파일에서는 vendor-case 조회 자체가 안 일어나게 한다
// (업체 사례는 이 배지 기능과 무관한 별도 관심사).
const CATEGORY_META: CategoryConstant = {
  code: "VENUE",
  name_ko: "예식장",
  display_order: 1,
  tier: "FOCUS",
  has_cost: true,
  has_benchmark: true,
  has_vendor_cases: false,
  allows_custom_tag: false,
};

function makeItem(overrides: Partial<ChecklistItem>): ChecklistItem {
  return {
    id: "item-1",
    category_code: "VENUE",
    item_type: "CONTRACT_TERM",
    option_group: null,
    origin: "LLM",
    status: "TODO",
    group_label: "계약 조항",
    title: "위약금·환불 규정 확인",
    body: "공정위 표준약관 기준 환불 규정과 일치하는지 대조",
    priority: "high",
    source_tier: null,
    source_label: "",
    source_url: null,
    tag: null,
    memo: null,
    ...overrides,
  };
}

beforeEach(() => {
  getChecklistItemsMock.mockReset();
});

describe("체크리스트 근거 배지", () => {
  it("source_tier가 있으면 티어 한글 라벨 + source_label로 배지를 보여준다", async () => {
    getChecklistItemsMock.mockResolvedValue({
      items: [makeItem({ source_tier: "OFFICIAL", source_label: "공정위 예식장이용 표준약관(제10030호)" })],
    });
    render(<ChecklistTab categoryCode="VENUE" categoryMeta={CATEGORY_META} />);

    expect(await screen.findByText("공식 · 공정위 예식장이용 표준약관(제10030호)")).toBeInTheDocument();
  });

  it("source_tier가 null인 LLM 생성 항목은 배지를 아예 생략한다", async () => {
    getChecklistItemsMock.mockResolvedValue({
      items: [makeItem({ source_tier: null, source_label: "" })],
    });
    render(<ChecklistTab categoryCode="VENUE" categoryMeta={CATEGORY_META} />);

    expect(await screen.findByText("위약금·환불 규정 확인")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /근거 자세히 보기/u })).not.toBeInTheDocument();
  });

  it("사용자가 직접 추가한 항목은 source_tier와 무관하게 '내가 추가' 배지만 보여준다", async () => {
    getChecklistItemsMock.mockResolvedValue({
      items: [makeItem({ origin: "USER", source_tier: null })],
    });
    render(<ChecklistTab categoryCode="VENUE" categoryMeta={CATEGORY_META} />);

    expect(await screen.findByText("내가 추가")).toBeInTheDocument();
  });

  it("근거 배지를 누르면 원문 링크가 있는 상세 내용이 펼쳐진다", async () => {
    const user = userEvent.setup();
    getChecklistItemsMock.mockResolvedValue({
      items: [
        makeItem({
          source_tier: "OFFICIAL",
          source_label: "공정위 예식장이용 표준약관(제10030호)",
          source_url: "https://www.ftc.go.kr/standard-terms/10030",
        }),
      ],
    });
    render(<ChecklistTab categoryCode="VENUE" categoryMeta={CATEGORY_META} />);

    const trigger = await screen.findByRole("button", {
      name: "근거 자세히 보기: 공식 · 공정위 예식장이용 표준약관(제10030호)",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const link = screen.getByRole("link", { name: "원문 보기" });
    expect(link).toHaveAttribute("href", "https://www.ftc.go.kr/standard-terms/10030");
  });

  it("원문 링크가 없는 근거(CONSENSUS 등)는 펼쳤을 때 이유를 안내한다", async () => {
    const user = userEvent.setup();
    getChecklistItemsMock.mockResolvedValue({
      items: [makeItem({ source_tier: "CONSENSUS", source_label: "소비자 상담 사례", source_url: null })],
    });
    render(<ChecklistTab categoryCode="VENUE" categoryMeta={CATEGORY_META} />);

    await user.click(await screen.findByRole("button", { name: "근거 자세히 보기: 합의 · 소비자 상담 사례" }));

    expect(screen.getByText("팀에서 직접 정리한 자료라 원문 링크는 없어요.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "원문 보기" })).not.toBeInTheDocument();
  });
});
