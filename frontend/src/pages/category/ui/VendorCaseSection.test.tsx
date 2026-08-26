// 업체 사례 카드의 관련 공식 분쟁조정 사례(DS2_KCA) 링크 — MessageBubble.test.tsx의 인용 배지
// 테스트와 같은 패턴(entities/chat/ui/MessageBubble.test.tsx 참고, 2026-08-26 dev-35 요청 기반).
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { VendorCasesResponse } from "@/entities/vendor-case";
import { VendorCaseSection } from "./VendorCaseSection";

const LONG_TITLE = "예식장 위약금 관련 분쟁조정 사례 전문 — 계약 해제 시점에 따른 환급 비율";

function response(overrides: Partial<VendorCasesResponse> = {}): VendorCasesResponse {
  return {
    category_code: "VENUE",
    disclaimer: "실제 사례를 각색한 예시입니다.",
    cases: [
      {
        id: 1,
        case_type: "GOOD",
        case_label: "위약금 규정을 미리 확인한 사례",
        situation: "계약 전 위약금 조항을 꼼꼼히 확인했다.",
        key_lesson: "계약 전 위약금 조항을 반드시 확인하세요.",
        related_item_type: "CONTRACT_TERM",
        source_tier: "CONSENSUS",
        related_cases: [],
      },
    ],
    ...overrides,
  };
}

describe("업체 사례 — 관련 공식 분쟁사례 링크", () => {
  it("disclaimer와 카드 내용을 항상 보여준다", () => {
    render(<VendorCaseSection response={response()} />);

    expect(screen.getByText("실제 사례를 각색한 예시입니다.")).toBeInTheDocument();
    expect(screen.getByText("잘한 사례")).toBeInTheDocument();
    expect(screen.getByText("위약금 규정을 미리 확인한 사례")).toBeInTheDocument();
  });

  it("related_cases가 빈 배열이면 관련 사례 배지를 아예 안 낸다", () => {
    render(<VendorCaseSection response={response()} />);

    expect(screen.queryByText(/관련 분쟁사례/u)).not.toBeInTheDocument();
  });

  it("related_cases가 있으면 배지로 뜨고, 클릭하면 원문 링크가 펼쳐진다", async () => {
    const user = userEvent.setup();
    const withRelated = response({
      cases: [
        {
          id: 1,
          case_type: "BAD",
          case_label: "위약금 분쟁 사례",
          situation: "계약 해제 시점을 놓쳤다.",
          key_lesson: "해제 시점을 반드시 확인하세요.",
          related_item_type: "CONTRACT_TERM",
          source_tier: "OFFICIAL",
          related_cases: [{ chunk_id: 42, title: LONG_TITLE, source_tier: "OFFICIAL", source_url: "https://kca.go.kr/case/42" }],
        },
      ],
    });
    render(<VendorCaseSection response={withRelated} />);

    const trigger = screen.getByRole("button", { name: `관련 공식 분쟁사례 자세히 보기: 공식 · ${LONG_TITLE}` });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const link = screen.getByRole("link", { name: "원문 보기" });
    expect(link).toHaveAttribute("href", "https://kca.go.kr/case/42");
  });

  it("원문 링크가 없는 관련 사례는 펼쳤을 때 이유를 안내한다", async () => {
    const user = userEvent.setup();
    const withRelated = response({
      cases: [
        {
          id: 1,
          case_type: "BAD",
          case_label: "위약금 분쟁 사례",
          situation: "계약 해제 시점을 놓쳤다.",
          key_lesson: "해제 시점을 반드시 확인하세요.",
          related_item_type: "CONTRACT_TERM",
          source_tier: "OFFICIAL",
          related_cases: [{ chunk_id: 7, title: LONG_TITLE, source_tier: "NEWS", source_url: null }],
        },
      ],
    });
    render(<VendorCaseSection response={withRelated} />);

    await user.click(screen.getByRole("button", { name: `관련 공식 분쟁사례 자세히 보기: NEWS · ${LONG_TITLE}` }));

    expect(screen.getByText("원문 링크가 없는 자료예요.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "원문 보기" })).not.toBeInTheDocument();
  });
});
