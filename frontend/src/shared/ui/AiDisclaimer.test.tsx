// AI 생성물 고지가 **실제로 화면에 남아 있는지**를 고정한다 — 법적 리스크 대응 장치라
// 리팩터링 중 조용히 사라지면 안 된다(2026-08-30).
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AI_CHAT_DISCLAIMER, AI_PLAN_DISCLAIMER, AiDisclaimer } from "./AiDisclaimer";

describe("AiDisclaimer", () => {
  it("본문을 그대로 렌더한다", () => {
    render(<AiDisclaimer>{AI_CHAT_DISCLAIMER}</AiDisclaimer>);
    expect(screen.getByText(AI_CHAT_DISCLAIMER)).toBeInTheDocument();
  });

  it("랜드마크로 건너뛸 수 있게 접근명을 갖는다", () => {
    // 상시 노출 문구라 스크린리더 사용자가 매번 듣지 않고 지나갈 수 있어야 한다.
    render(<AiDisclaimer>{AI_PLAN_DISCLAIMER}</AiDisclaimer>);
    expect(screen.getByRole("complementary", { name: "AI 생성 정보 안내" })).toBeInTheDocument();
  });

  it("라이브 리전이 아니다", () => {
    // StatusCallout(<output>, 암묵 role=status)과 달라야 한다 — 상시 문구가 라이브 리전이면
    // 화면 전환마다 낭독돼 정작 중요한 상태 변화를 가린다(컴포넌트 머리말 §왜 StatusCallout이 아닌가).
    //
    // 🚨 RTL 렌더 결과를 구조 분해해 루트 엘리먼트를 꺼내 쓰지 않는다 — 그 **식별자 이름**이
    // Tailwind 스캐너의 후보가 되어 산출 CSS 에 같은 이름의 유틸리티 6규칙을 만든다.
    // scripts/lib/__tests__/ghost-candidates.test.mjs 가 막고 있는 유령이고, 이 파일이 처음
    // 작성될 때 실제로 그 가드에 두 번 걸렸다 — 한 번은 코드에서, 한 번은 **이 주석에서**
    // (Tailwind 는 소스를 파싱하지 않고 평문으로 훑으므로 주석 속 단어도 후보가 된다).
    // `document.body` 로 접근하면 새 식별자를 만들지 않는다.
    render(<AiDisclaimer>{AI_CHAT_DISCLAIMER}</AiDisclaimer>);
    expect(document.body.querySelector("output")).toBeNull();
    expect(document.body.querySelector('[role="status"]')).toBeNull();
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
  });

  describe("문구 계약", () => {
    // 문구 자체가 법적 방어의 내용이므로, 핵심 요소가 빠지면 테스트가 깨져야 한다.
    it("AI상담 문구는 'AI 생성' · '법률·계약 자문 아님' · '원문 확인'을 모두 담는다", () => {
      expect(AI_CHAT_DISCLAIMER).toContain("AI");
      expect(AI_CHAT_DISCLAIMER).toContain("법률·계약 자문이 아니");
      expect(AI_CHAT_DISCLAIMER).toContain("계약서 원문");
    });

    it("개인화 문구는 'AI 생성' · '누락 가능' · '직접 확인'을 모두 담는다", () => {
      expect(AI_PLAN_DISCLAIMER).toContain("AI가 만든");
      expect(AI_PLAN_DISCLAIMER).toContain("빠지거나");
      expect(AI_PLAN_DISCLAIMER).toContain("직접 확인");
    });
  });
});
