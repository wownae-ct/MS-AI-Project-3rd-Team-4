// 답변 하단 근거 영역 회귀 테스트.
//
// **[2026-08-29 재작성 — D16]** 이 파일의 이전 판은 「인용 배지가 truncate 로 한 줄 고정되고,
// 잘려도 title 속성에 전문이 남는다」를 고정하고 있었다. 그 계약 자체가 결함이었다 — 터치 기기에는
// hover 가 없어 title 은 읽을 수 없고, 인용이 최대 5개라(RAG_CONTEXT_TOP_K=5) 220px 알약이 가로로
// 늘어섰다(사용자 리포트 2026-08-29 두 건). 지금 고정하는 것은 그 자리에 들어온 새 계약이다:
//   · 검증 결과는 여전히 배지 하나로 남는다(짧고 고정된 어휘)
//   · 인용은 SourceList 가 받는다 — 접히면 개수+최고 등급, 펼치면 잘리지 않은 전문
//
// 목록 자체의 동작은 shared/ui/SourceList.test.tsx 가 덮는다. 여기서는 **말풍선이 무엇을 어떤
// 모양으로 넘기는지**만 단언한다.
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

describe("AI 답변 — 검증 배지", () => {
  it("verdict 3종을 목업 문구 그대로 낸다", () => {
    const { rerender } = render(<MessageBubble message={MESSAGE} />);
    expect(screen.getByText("✓ 근거 확인됨")).toBeInTheDocument();

    rerender(<MessageBubble message={{ ...MESSAGE, verification: { verdict: "WEAK", reason: "" } }} />);
    expect(screen.getByText("근거 불충분")).toBeInTheDocument();

    rerender(<MessageBubble message={{ ...MESSAGE, verification: { verdict: "GENERAL", reason: "" } }} />);
    expect(screen.getByText("일반 정보 · 근거 없음")).toBeInTheDocument();
  });

  it("verification이 아직 안 왔으면(스트리밍 중) 근거 영역을 아예 안 낸다", () => {
    render(<MessageBubble message={{ ...MESSAGE, verification: undefined }} />);

    // 이 시점엔 "근거 없음"조차 확정된 사실이 아니다.
    expect(screen.queryByText("✓ 근거 확인됨")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /근거/u })).not.toBeInTheDocument();
  });

  it("인용이 하나도 없으면 검증 배지만 남고 빈 토글을 내지 않는다", () => {
    render(<MessageBubble message={{ ...MESSAGE, citations: [], verification: { verdict: "GENERAL", reason: "" } }} />);

    expect(screen.getByText("일반 정보 · 근거 없음")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /근거/u })).not.toBeInTheDocument();
  });
});

describe("AI 답변 — 인용 근거", () => {
  it("source_tier는 ENUM 원문이 아니라 한글 라벨로 뜬다", () => {
    render(<MessageBubble message={MESSAGE} />);

    expect(screen.getByRole("button", { name: "공식 근거 1개" })).toBeInTheDocument();
    expect(screen.queryByText(/OFFICIAL/u)).not.toBeInTheDocument();
  });

  it("긴 출처 제목이 펼침에서 잘리지 않고 전문으로 나온다", async () => {
    const user = userEvent.setup();
    render(<MessageBubble message={MESSAGE} />);

    await user.click(screen.getByRole("button", { name: "공식 근거 1개" }));

    // 종전엔 이 전문이 title 속성(hover)에만 있었다 — 터치 기기에서 읽을 수 없던 것이 결함이었다.
    expect(screen.getByText(LONG_TITLE)).toBeInTheDocument();
  });

  it("인용이 여러 개여도 토글 하나로 접힌다 — 가로로 나열되지 않는다", () => {
    render(
      <MessageBubble
        message={{
          ...MESSAGE,
          citations: [
            { chunk_id: 1, title: LONG_TITLE, source_tier: "OFFICIAL", source_url: null },
            { chunk_id: 2, title: "웨딩홀 계약 시 확인할 항목 정리", source_tier: "CONSENSUS", source_url: null },
            { chunk_id: 3, title: "2025 웨딩 비용 리포트", source_tier: "INDUSTRY", source_url: null },
          ],
        }}
      />,
    );

    // 종전엔 여기에 인용 개수만큼 버튼이 생겨 가로로 늘어섰다. 지금은 정확히 하나다.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "공식 근거 포함 · 3개" })).toBeInTheDocument();
  });

  it("펼치면 제목 자체가 원문 링크다", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={{
          ...MESSAGE,
          citations: [{ chunk_id: 1, title: LONG_TITLE, source_tier: "INDUSTRY", source_url: "https://example.com/doc" }],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "업계 근거 1개" }));

    expect(screen.getByRole("link", { name: LONG_TITLE })).toHaveAttribute("href", "https://example.com/doc");
  });

  it("원문 링크가 없는 근거는 펼쳤을 때 이유를 안내한다", async () => {
    const user = userEvent.setup();
    render(<MessageBubble message={MESSAGE} />);

    await user.click(screen.getByRole("button", { name: "공식 근거 1개" }));

    expect(screen.getByText("팀에서 직접 정리한 자료라 원문 링크는 없어요.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
