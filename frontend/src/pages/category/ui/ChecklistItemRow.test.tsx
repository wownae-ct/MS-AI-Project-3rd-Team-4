// 신고(F13) 버튼 노출 조건 회귀 테스트 — 2026-08-28 backend origin='LLM' mislabel 수정으로
// origin이 LLM/USER 2값에서 LLM/USER/CATALOG_FALLBACK 3값으로 늘면서, 노출 조건도
// `origin === "LLM"`에서 `origin !== "USER"`로 넓어졌다. 이 파일이 생기기 전엔 이 컴포넌트
// 자체에 테스트가 없었다.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ChecklistItem } from "@/entities/checklist";
import { ChecklistItemRow } from "./ChecklistItemRow";

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

describe("ChecklistItemRow — 신고 버튼 노출", () => {
  it("origin=LLM이면 신고 버튼이 보인다", () => {
    render(
      <ChecklistItemRow item={makeItem({ origin: "LLM" })} categoryCode="VENUE" onStatusChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "신고" })).toBeInTheDocument();
  });

  it("origin=CATALOG_FALLBACK이어도 신고 버튼이 보인다(카탈로그 폴백도 시스템 콘텐츠)", () => {
    render(
      <ChecklistItemRow
        item={makeItem({ origin: "CATALOG_FALLBACK" })}
        categoryCode="VENUE"
        onStatusChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "신고" })).toBeInTheDocument();
  });

  it("origin=USER이면 신고 버튼이 안 보인다(본인 입력)", () => {
    render(
      <ChecklistItemRow item={makeItem({ origin: "USER" })} categoryCode="VENUE" onStatusChange={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "신고" })).not.toBeInTheDocument();
  });
});
