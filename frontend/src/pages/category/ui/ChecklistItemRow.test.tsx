// 신고(F13) 버튼 노출 조건 회귀 테스트 — 2026-08-28 backend origin='LLM' mislabel 수정으로
// origin이 LLM/USER 2값에서 LLM/USER/CATALOG_FALLBACK 3값으로 늘면서, 노출 조건도
// `origin === "LLM"`에서 `origin !== "USER"`로 넓어졌다. 이 파일이 생기기 전엔 이 컴포넌트
// 자체에 테스트가 없었다.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// D16 — 종전엔 제목(truncate)과 근거 배지(max-w-[160px] truncate)가 같은 줄에서 폭을 다퉈 둘 다
// 잘렸다. 근거를 아래 줄로 내리고 제목의 말줄임을 걷었다(사용자 리포트 2026-08-29).
describe("ChecklistItemRow — 근거 표시", () => {
  const LONG_LABEL = "소비자분쟁해결기준 제3장 예식업 위약금 환급 규정";
  const LONG_TITLE = "계약 해제 시점별 위약금 환급 비율을 표준약관과 대조해 확인하기";

  it("source_tier가 있으면 접힌 요약으로 뜨고, 펼치면 출처명 전문이 나온다", async () => {
    const user = userEvent.setup();
    render(
      <ChecklistItemRow
        item={makeItem({ title: LONG_TITLE, source_tier: "OFFICIAL", source_label: LONG_LABEL })}
        categoryCode="VENUE"
        onStatusChange={vi.fn()}
      />,
    );

    // 제목은 잘리지 않고 그대로 남는다 — 항목의 정체성이라 잃을 수 없는 정보다.
    expect(screen.getByText(LONG_TITLE)).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "공식 근거 1개" });
    expect(screen.queryByText(LONG_LABEL)).not.toBeInTheDocument();

    await user.click(toggle);

    expect(screen.getByText(LONG_LABEL)).toBeInTheDocument();
  });

  it("source_tier가 null이면 근거 줄 자체를 생략한다(빈 배지를 만들지 않는다)", () => {
    render(
      <ChecklistItemRow item={makeItem({ source_tier: null })} categoryCode="VENUE" onStatusChange={vi.fn()} />,
    );

    expect(screen.queryByRole("button", { name: /근거/u })).not.toBeInTheDocument();
  });

  it("origin=USER는 등급 대신 「내가 추가」 배지만 낸다", () => {
    render(
      <ChecklistItemRow
        item={makeItem({ origin: "USER", source_tier: "OFFICIAL", source_label: LONG_LABEL })}
        categoryCode="VENUE"
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByText("내가 추가")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /근거/u })).not.toBeInTheDocument();
  });
});
