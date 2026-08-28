// SourceList 계약 테스트 — D16(docs/design/decisions.md)이 배지 나열을 대체하며 세운 것들.
//
// 시각 레이아웃(잘림·가로 나열)은 CSS라 RTL로 검증할 수 없다 — 이 저장소 관례대로 접근 가능한
// 값만 단언한다(react/testing.md). 그래서 여기서 지키는 것은 **정보 파리티**다: 접힌 상태가
// 개수와 최고 등급을 말하는가, 펼치면 제목 전문과 원문 링크가 나오는가.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Badge } from "./Badge";
import { SourceList } from "./SourceList";

const LONG_TITLE = "결혼식장 표준약관 제9조 위약금 및 계약해제에 관한 세부 조항 전문";

describe("SourceList — 요약 문구", () => {
  it("하나면 등급과 함께 말한다", () => {
    render(<SourceList items={[{ key: 1, tier: "OFFICIAL", title: LONG_TITLE, url: null }]} />);

    expect(screen.getByRole("button", { name: "공식 근거 1개" })).toBeInTheDocument();
  });

  it("여럿이고 공식이 섞였으면 그 사실을 접힌 채로 알린다", () => {
    render(
      <SourceList
        items={[
          { key: 1, tier: "INDUSTRY", title: "업계 자료", url: null },
          { key: 2, tier: "OFFICIAL", title: LONG_TITLE, url: null },
          { key: 3, tier: "CONSENSUS", title: "합의 자료", url: null },
        ]}
      />,
    );

    // 종전 배지 나열은 3개를 모두 훑어야 알 수 있던 사실이다 — 요약이 정보를 줄이지 않는다는 근거.
    expect(screen.getByRole("button", { name: "공식 근거 포함 · 3개" })).toBeInTheDocument();
  });

  it("공식이 없으면 개수만 말한다", () => {
    render(
      <SourceList
        items={[
          { key: 1, tier: "INDUSTRY", title: "업계 자료", url: null },
          { key: 2, tier: "CONSENSUS", title: "합의 자료", url: null },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "근거 2개" })).toBeInTheDocument();
  });

  it("명사를 바꿔 부를 수 있다(업체 사례의 관련 분쟁사례)", () => {
    render(
      <SourceList noun="관련 분쟁사례" items={[{ key: 1, tier: "OFFICIAL", title: LONG_TITLE, url: null }]} />,
    );

    expect(screen.getByRole("button", { name: "공식 관련 분쟁사례 1개" })).toBeInTheDocument();
  });

  it("모르는 등급 값은 지어내지 않고 원문 그대로 쓴다", () => {
    render(<SourceList items={[{ key: 1, tier: "NEWS", title: LONG_TITLE, url: null }]} />);

    expect(screen.getByRole("button", { name: "NEWS 근거 1개" })).toBeInTheDocument();
  });
});

describe("SourceList — 펼침", () => {
  it("접힌 상태에서는 제목이 없고, 펼치면 잘리지 않은 전문이 나온다", async () => {
    const user = userEvent.setup();
    render(<SourceList items={[{ key: 1, tier: "OFFICIAL", title: LONG_TITLE, url: null }]} />);

    const toggle = screen.getByRole("button", { name: "공식 근거 1개" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(LONG_TITLE)).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // 종전엔 이 자리가 max-w-[220px] truncate 배지라 title 속성(hover)에만 전문이 남았다.
    // 이제는 화면 텍스트 자체가 전문이다 — 터치 기기에서도 읽을 수 있다는 것이 이 단언의 뜻이다.
    expect(screen.getByText(LONG_TITLE)).toBeInTheDocument();
  });

  it("펼치면 제목 자체가 원문 링크다 — 상세를 한 번 더 열지 않는다", async () => {
    const user = userEvent.setup();
    render(<SourceList items={[{ key: 1, tier: "OFFICIAL", title: LONG_TITLE, url: "https://example.com/doc" }]} />);

    await user.click(screen.getByRole("button", { name: "공식 근거 1개" }));

    const link = screen.getByRole("link", { name: LONG_TITLE });
    expect(link).toHaveAttribute("href", "https://example.com/doc");
  });

  it("원문 링크가 없으면 이유를 안내한다", async () => {
    const user = userEvent.setup();
    render(<SourceList items={[{ key: 1, tier: "CONSENSUS", title: LONG_TITLE, url: null }]} />);

    await user.click(screen.getByRole("button", { name: "합의 근거 1개" }));

    expect(screen.getByText("팀에서 직접 정리한 자료라 원문 링크는 없어요.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("안내 문구는 호출부가 바꿀 수 있다(자료 출처마다 이유가 다르다)", async () => {
    const user = userEvent.setup();
    render(
      <SourceList
        noun="관련 분쟁사례"
        noUrlNote="원문 링크가 없는 자료예요."
        items={[{ key: 1, tier: "OFFICIAL", title: LONG_TITLE, url: null }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "공식 관련 분쟁사례 1개" }));

    expect(screen.getByText("원문 링크가 없는 자료예요.")).toBeInTheDocument();
  });

  it("http(s)가 아닌 스킴은 링크로 만들지 않는다", async () => {
    const user = userEvent.setup();
    render(
      // eslint 가 아니라 safe-url.ts 가 막는다 — 값이 백엔드에서 온 문자열이라 방어적으로 검증한다.
      <SourceList items={[{ key: 1, tier: "OFFICIAL", title: LONG_TITLE, url: "javascript:alert(1)" }]} />,
    );

    await user.click(screen.getByRole("button", { name: "공식 근거 1개" }));

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("팀에서 직접 정리한 자료라 원문 링크는 없어요.")).toBeInTheDocument();
  });
});

describe("SourceList — 근거가 없을 때", () => {
  it("빈 토글을 내지 않는다", () => {
    render(<SourceList items={[]} />);

    // ⚠️ RTL 렌더 결과에서 루트 요소를 구조 분해로 꺼내지 않는다 — 그 표준 필드명이 Tailwind
    // 스캐너의 후보가 되어 산출 CSS 에 유틸리티 6규칙이 생긴다(Card.test.tsx 가 실제로 당했고
    // ghost-candidates.test.mjs 가 그 재발을 막는다). **이 주석에도 그 단어를 적지 않는다** —
    // 스캐너는 파일을 파싱하지 않고 평문으로 훑어 주석 속 단어 하나를 그대로 후보로 만든다
    // (DisclosurePanel.tsx 머리말이 같은 이유로 CSS 속성 이름을 피한다).
    expect(document.body.textContent).toBe("");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("leading 은 그대로 낸다 — 「근거 없음」도 확정된 사실이라 감추지 않는다", () => {
    render(<SourceList items={[]} leading={<Badge>일반 정보 · 근거 없음</Badge>} />);

    expect(screen.getByText("일반 정보 · 근거 없음")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
