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
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatMessage } from "../model";
import { MessageBubble } from "./MessageBubble";

// 화면에 나가는 이모지를 잡는다(D18). 소스 전역 게이트(scripts/lib/source-norms.mjs)가 아니라
// **렌더 결과**를 보는 이유 — 그 스캐너는 정규식 기반이라 주석을 구분하지 못하는데, 이 저장소
// 주석에는 🚨·⚠️ 가 의도적으로 많다. 화면에 나가는 것만 정확히 잡으려면 여기가 맞는 자리다.
const EMOJI = /\p{Extended_Pictographic}/u;

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
  // 앞 두 문구의 「답변」은 레드팀 감사 #6 이 붙였다 — 배지가 판정한 대상이 **답변**이지 원
  // 질문 충족 여부가 아님을 밝힌다(MessageBubble.tsx 의 VERDICT_LABEL 머리말).
  it("verdict 4종을 서로 다른 문구로 낸다", () => {
    const { rerender } = render(<MessageBubble message={MESSAGE} />);
    expect(screen.getByText("답변 근거 확인됨")).toBeInTheDocument();

    rerender(<MessageBubble message={{ ...MESSAGE, verification: { verdict: "WEAK", reason: "" } }} />);
    expect(screen.getByText("답변 근거 불충분")).toBeInTheDocument();

    rerender(<MessageBubble message={{ ...MESSAGE, verification: { verdict: "GENERAL", reason: "" } }} />);
    expect(screen.getByText("일반 정보 · 근거 없음")).toBeInTheDocument();

    rerender(<MessageBubble message={{ ...MESSAGE, verification: { verdict: "OUT_OF_SCOPE", reason: "" } }} />);
    expect(screen.getByText("상담 범위 밖")).toBeInTheDocument();
  });

  // 이번 버그의 본질은 "크래시"가 아니라 **문구 오염**이었다 — 스코프 이탈 거절이 GENERAL 을
  // 재사용해 「일반 정보 · 근거 없음」으로 떴다. 위 4종 테스트만으로는 이걸 못 잡는다:
  // VERDICT_FALLBACK 이 마침 GENERAL 과 같은 문구라, 라벨 항목을 빼먹어도 폴백이 통과시킨다.
  // 두 문구가 서로 새지 않는다는 것을 양방향으로 못박는다.
  it("OUT_OF_SCOPE 와 GENERAL 은 서로의 문구로 새지 않는다", () => {
    const { rerender } = render(
      <MessageBubble message={{ ...MESSAGE, verification: { verdict: "OUT_OF_SCOPE", reason: "" } }} />,
    );
    expect(screen.queryByText("일반 정보 · 근거 없음")).not.toBeInTheDocument();

    rerender(<MessageBubble message={{ ...MESSAGE, verification: { verdict: "GENERAL", reason: "" } }} />);
    expect(screen.queryByText("상담 범위 밖")).not.toBeInTheDocument();
  });

  it("verification이 아직 안 왔으면(스트리밍 중) 근거 영역을 아예 안 낸다", () => {
    render(<MessageBubble message={{ ...MESSAGE, verification: undefined }} />);

    // 이 시점엔 "근거 없음"조차 확정된 사실이 아니다.
    expect(screen.queryByText("답변 근거 확인됨")).not.toBeInTheDocument();
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

// 평가 버튼은 그동안 테스트가 **한 건도 없었다**(ChatPanel.test.tsx 도 평가를 다루지 않는다).
// 👍/👎 이모지를 자체 아이콘으로 바꾸면서(D18) 함께 채운다 — 특히 접근명과 aria-pressed 는
// 이모지가 사라져도 **글자 그대로 유지되어야 하는** 계약이라 여기서 못박는다.
describe("AI 답변 — 평가 버튼", () => {
  const RATED: ChatMessage = { ...MESSAGE, user_rating: "GOOD" };

  it("onRate 를 안 넘기면(인사말·스트리밍 draft) 평가 버튼이 아예 없다", () => {
    render(<MessageBubble message={MESSAGE} />);

    expect(screen.queryByRole("button", { name: /도움됐어요|아쉬워요/u })).not.toBeInTheDocument();
  });

  it("verification 이 아직 안 왔으면 평가 버튼이 없다 — 완결된 답변이 아니다", () => {
    render(<MessageBubble message={{ ...MESSAGE, verification: undefined }} onRate={() => {}} />);

    expect(screen.queryByRole("button", { name: /도움됐어요|아쉬워요/u })).not.toBeInTheDocument();
  });

  it("접근명은 이모지 시절 문구 그대로다 — 아이콘은 장식이라 이름을 만들지 않는다", () => {
    render(<MessageBubble message={MESSAGE} onRate={() => {}} />);

    expect(screen.getByRole("button", { name: "이 답변이 도움됐어요" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이 답변이 아쉬워요" })).toBeInTheDocument();
  });

  it("누르면 해당 메시지 id 와 등급으로 onRate 가 불린다", async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    render(<MessageBubble message={MESSAGE} onRate={onRate} />);

    await user.click(screen.getByRole("button", { name: "이 답변이 아쉬워요" }));

    expect(onRate).toHaveBeenCalledExactlyOnceWith("m1", "BAD");
  });

  // 배타적 선택이므로 한쪽이 눌린 동안 다른 쪽은 반드시 false 다 — 둘 다 true 로 보이면
  // 스크린리더 사용자에게는 "둘 다 눌림"으로 읽힌다.
  it("선택 상태가 aria-pressed 로 나오고, 반대쪽은 눌리지 않은 상태로 남는다", () => {
    render(<MessageBubble message={RATED} onRate={() => {}} />);

    expect(screen.getByRole("button", { name: "이 답변이 도움됐어요" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "이 답변이 아쉬워요" })).toHaveAttribute("aria-pressed", "false");
  });

  // 선택을 **색 하나로만** 알리지 않는다(WCAG 1.4.1). 형태 채널은 아이콘의 fill 이다 —
  // 선택된 쪽만 면이 채워지고, 반대쪽은 선으로 남는다.
  //
  // ⚠️ 버튼을 접근명으로 집는다. 위치(querySelectorAll)로 집으면 근거 목록 토글이 첫 버튼이라
  // 엉뚱한 svg(IconChevronDown)를 검사하게 된다 — 실제로 한 번 당했다.
  it("선택된 쪽 아이콘만 면이 채워진다 — 색 말고 형태로도 구분된다", () => {
    render(<MessageBubble message={RATED} onRate={() => {}} />);

    const up = screen.getByRole("button", { name: "이 답변이 도움됐어요" }).querySelector("svg");
    const down = screen.getByRole("button", { name: "이 답변이 아쉬워요" }).querySelector("svg");

    expect(up).toHaveAttribute("fill", "currentColor");
    expect(down).toHaveAttribute("fill", "none");
  });

  // RTL 의 렌더 루트를 구조 분해하지 않고 document.body 로 읽는다 — 그 식별자는 Tailwind
  // 스캐너의 bare 후보가 되어 산출 CSS 에 규칙 하나를 만든다(ghost-candidates.test.mjs 가 막고
  // 있는 유령이고, 그 테스트가 이름을 갖고 있다). screen 이 보는 곳과 같은 노드다.
  //
  // ⚠️ 이 주석에 그 식별자를 평문으로 적지 않는다 — 스캐너는 주석도 후보로 삼는다.
  it("화면에 이모지가 남아 있지 않다", () => {
    render(<MessageBubble message={RATED} onRate={() => {}} />);

    expect(document.body.textContent).not.toMatch(EMOJI);
  });
});
