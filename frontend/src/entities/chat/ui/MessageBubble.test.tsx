// 인용 근거 배지 회귀 테스트 — 사용자 리포트(2026-08-26) "화면이 깨져보여, 글자가 크고 박스가
// 커". 긴 출처 제목이 rounded-pill 배지 안에서 줄바꿈되면 배지 모양 자체가 일그러졌다 — 개별
// 배지를 truncate로 한 줄 고정했으므로, 잘려도 title 속성으로 전체 문구가 남는지만 확인한다
// (실제 시각 레이아웃은 CSS라 RTL로 검증할 수 없다 — react/testing.md 관례대로 접근 가능한
// 값만 단언한다).
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ChatMessage } from "../model";
import { MessageBubble } from "./MessageBubble";

const LONG_TITLE = "결혼식장 표준약관 제9조 위약금 및 계약해제에 관한 세부 조항 전문";

const MESSAGE: ChatMessage = {
  id: "m1",
  role: "assistant",
  content: "위약금은 계약금의 10%입니다.",
  citations: [{ chunk_id: 1, title: LONG_TITLE, source_tier: "OFFICIAL", source_url: null }],
  verification: { verdict: "SUPPORTED", reason: "" },
  created_at: "",
};

describe("인용 근거 배지", () => {
  it("긴 출처 제목도 title 속성에 전체 문구가 남는다", () => {
    render(<MessageBubble message={MESSAGE} />);

    const badge = screen.getByText(`OFFICIAL · ${LONG_TITLE}`);
    expect(badge).toHaveAttribute("title", `OFFICIAL · ${LONG_TITLE}`);
  });
});
