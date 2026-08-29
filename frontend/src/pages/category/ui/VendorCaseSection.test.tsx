// 업체 사례 카드의 관련 공식 분쟁조정 사례(DS2_KCA) 링크 — MessageBubble.test.tsx와 같은 패턴.
//
// **[2026-08-29 갱신 — D16]** 관련 사례가 배지 나열에서 SourceList(접힘 요약 + 세로 목록)로
// 옮겨가면서 조회 경로가 바뀌었다: 배지 텍스트가 아니라 요약 문구로 토글을 찾고, 펼치면 제목
// 자체가 링크다. 목록의 동작 자체는 shared/ui/SourceList.test.tsx 가 덮는다.
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

  it("related_cases가 빈 배열이면 관련 사례 줄을 아예 안 낸다", () => {
    render(<VendorCaseSection response={response()} />);

    expect(screen.queryByText(/관련 분쟁사례/u)).not.toBeInTheDocument();
  });

  it("긴 case_label 옆에서도 사례 배지 문구가 온전히 남는다", () => {
    // 눌림 회귀(D16)의 접근 가능한 대리 단언 — 실제 잘림은 CSS라 RTL이 못 보지만, 이 화면이
    // 배지와 긴 제목을 한 줄에 나란히 놓는 유일한 자리라 조합 자체를 고정해 둔다.
    const longLabel = "계약 해제 시점에 따른 위약금 환급 비율을 미리 확인해 분쟁을 피한 사례";
    render(<VendorCaseSection response={response({ cases: [{ ...response().cases[0], case_label: longLabel }] })} />);

    expect(screen.getByText("잘한 사례")).toBeInTheDocument();
    expect(screen.getByText(longLabel)).toBeInTheDocument();
  });

  it("related_cases가 있으면 요약으로 접혀 뜨고, 펼치면 원문 링크가 나온다", async () => {
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

    const trigger = screen.getByRole("button", { name: "공식 관련 분쟁사례 1개" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    // 접힌 상태에서는 제목이 화면에 없다 — 종전엔 잘린 채로 배지에 박혀 있었다.
    expect(screen.queryByText(LONG_TITLE)).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    // 제목 자체가 링크다(2단계 → 1단계).
    const link = screen.getByRole("link", { name: LONG_TITLE });
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

    // NEWS는 SOURCE_TIER_LABEL에 없는 값이다 — 지어내지 않고 원문 그대로 요약에 실린다.
    await user.click(screen.getByRole("button", { name: "NEWS 관련 분쟁사례 1개" }));

    expect(screen.getByText("원문 링크가 없는 자료예요.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
