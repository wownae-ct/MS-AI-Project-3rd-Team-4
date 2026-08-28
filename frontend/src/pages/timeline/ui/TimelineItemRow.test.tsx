// 신고(F13) 버튼 노출 조건 회귀 테스트 — ChecklistItemRow.test.tsx와 동일 이유
// (2026-08-28 backend origin='LLM' mislabel 수정, origin !== "USER"로 조건 확장). 이 파일이
// 생기기 전엔 이 컴포넌트 자체에 테스트가 없었다.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TimelineItem } from "@/entities/timeline";
import { TimelineItemRow } from "./TimelineItemRow";

function makeItem(overrides: Partial<TimelineItem>): TimelineItem {
  return {
    id: "item-1",
    category_code: "VENUE",
    origin: "LLM",
    title: "예식장 계약",
    target_date: "2027-03-15",
    status: "TODO",
    date_overridden: false,
    is_overdue: false,
    ...overrides,
  };
}

describe("TimelineItemRow — 신고 버튼 노출", () => {
  it("origin=LLM이면 신고 버튼이 보인다", () => {
    render(<TimelineItemRow item={makeItem({ origin: "LLM" })} categoryLabel="예식장" onStatusChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "신고" })).toBeInTheDocument();
  });

  it("origin=CATALOG_FALLBACK이어도 신고 버튼이 보인다(카탈로그 폴백도 시스템 콘텐츠)", () => {
    render(
      <TimelineItemRow
        item={makeItem({ origin: "CATALOG_FALLBACK" })}
        categoryLabel="예식장"
        onStatusChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "신고" })).toBeInTheDocument();
  });

  it("origin=USER이면 신고 버튼이 안 보인다(본인 입력)", () => {
    render(<TimelineItemRow item={makeItem({ origin: "USER" })} categoryLabel="예식장" onStatusChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "신고" })).not.toBeInTheDocument();
  });
});
