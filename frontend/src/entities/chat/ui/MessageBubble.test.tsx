// 인용 근거 배지 회귀 테스트 — 사용자 리포트(2026-08-26) "화면이 깨져보여, 글자가 크고 박스가
// 커". 긴 출처 제목이 rounded-pill 배지 안에서 줄바꿈되면 배지 모양 자체가 일그러졌다 — 개별
// 배지를 truncate로 한 줄 고정했으므로, 잘려도 title 속성으로 전체 문구가 남는지만 확인한다
// (실제 시각 레이아웃은 CSS라 RTL로 검증할 수 없다 — react/testing.md 관례대로 접근 가능한
// 값만 단언한다).
//
// source_tier 한글 라벨 + 클릭 펼침 테스트 추가(사용자 요청 2026-08-26) — "근거 이름이 CONSENSUS/
// INDUSTRY처럼 영문 ENUM 그대로 뜬다, 한글로 보여줬으면 좋겠고 클릭하면 내용이 보였으면 좋겠다".
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("source_tier는 ENUM 원문이 아니라 한글 라벨로 뜬다", () => {
    render(<MessageBubble message={MESSAGE} />);

    expect(screen.getByText(`공식 · ${LONG_TITLE}`)).toBeInTheDocument();
    expect(screen.queryByText(`OFFICIAL · ${LONG_TITLE}`)).not.toBeInTheDocument();
  });

  it("긴 출처 제목도 title 속성에 전체 문구가 남는다", () => {
    render(<MessageBubble message={MESSAGE} />);

    const badge = screen.getByText(`공식 · ${LONG_TITLE}`);
    expect(badge).toHaveAttribute("title", `공식 · ${LONG_TITLE}`);
  });

  it("근거 배지를 누르면 원문 링크가 있는 상세 내용이 펼쳐진다", async () => {
    const user = userEvent.setup();
    const withUrl: ChatMessage = {
      ...MESSAGE,
      citations: [{ chunk_id: 1, title: LONG_TITLE, source_tier: "INDUSTRY", source_url: "https://example.com/doc" }],
    };
    render(<MessageBubble message={withUrl} />);

    const trigger = screen.getByRole("button", { name: `근거 자세히 보기: 업계 · ${LONG_TITLE}` });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const link = screen.getByRole("link", { name: "원문 보기" });
    expect(link).toHaveAttribute("href", "https://example.com/doc");
  });

  it("원문 링크가 없는 근거는 펼쳤을 때 이유를 안내한다", async () => {
    const user = userEvent.setup();
    render(<MessageBubble message={MESSAGE} />);

    await user.click(screen.getByRole("button", { name: `근거 자세히 보기: 공식 · ${LONG_TITLE}` }));

    expect(screen.getByText("팀에서 직접 정리한 자료라 원문 링크는 없어요.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "원문 보기" })).not.toBeInTheDocument();
  });
});
