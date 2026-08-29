// 배지의 두 계약 (D16 · D17).
//
// D16 — 배지는 어떤 flex 안에서도 눌리지 않는다(`shrink-0 whitespace-nowrap`). 이 두 유틸리티가
// 빠지면 한국어 배지가 「주/의/할/사/례」로 세로로 접힌다. 변이가 생겼으므로 **두 변이 모두**
// 그 계약을 지키는지 고정한다 — 한쪽에만 붙이면 D16 이 반쪽만 살아 있게 된다.
//
// D17 — 형태(채움/테두리)가 계열을 나타낸다. 기본이 채움이라는 것이 계약이다: 기존 호출부 9곳은
// `variant` 를 넘기지 않으므로, 기본값이 바뀌면 그 아홉 곳이 조용히 다른 모양이 된다.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("기본은 채움 변이 — primary-soft 배경에 primary 글자", () => {
    render(<Badge>강조</Badge>);
    const badge = screen.getByText("강조");
    expect(badge.className).toContain("bg-primary-soft");
    expect(badge.className).toContain("text-primary");
    expect(badge.className).not.toContain("border-current");
  });

  it("테두리 변이는 surface 배경 + border-current — 보더 색이 글자 색을 따라온다", () => {
    render(<Badge variant="outline">잔금</Badge>);
    const badge = screen.getByText("잔금");
    expect(badge.className).toContain("border-current");
    expect(badge.className).toContain("bg-surface");
    expect(badge.className).not.toContain("bg-primary-soft");
  });

  it("두 변이 모두 눌리지 않는다 (D16)", () => {
    render(
      <>
        <Badge>채움</Badge>
        <Badge variant="outline">테두리</Badge>
      </>,
    );
    for (const label of ["채움", "테두리"]) {
      const badge = screen.getByText(label);
      expect(badge.className, label).toContain("shrink-0");
      expect(badge.className, label).toContain("whitespace-nowrap");
    }
  });

  // 🚨 이 저장소가 실제로 겪은 사고를 고정한다. 예전 방식(색을 className 으로 덮기)은 기준 색과
  // **명시도가 같아** 산출 CSS 의 정렬 순서가 승자를 정했고, `payment` < `primary` 라서 D13 의
  // 결제 유형 색은 도입 후 한 번도 뜨지 않았다. `tone` 은 덮어쓰기가 아니라 **치환**이라
  // 경쟁하는 유틸리티가 애초에 생기지 않는다 — 아래 두 단언이 그 성질을 지킨다.
  it("tone 은 변이의 기본색을 덮는 게 아니라 치환한다 — 경쟁 유틸리티가 남지 않는다", () => {
    render(<Badge tone="bg-category-venue-soft text-category-venue">예식장</Badge>);
    const badge = screen.getByText("예식장");
    expect(badge.className).toContain("bg-category-venue-soft");
    expect(badge.className).toContain("text-category-venue");
    expect(badge.className).not.toContain("bg-primary-soft");
    expect(badge.className).not.toContain("text-primary");
  });

  it("테두리 변이의 tone 은 글자색만 넘겨도 된다 — 배경/보더는 형태가 정한다", () => {
    render(
      <Badge variant="outline" tone="text-payment-balance">
        잔금
      </Badge>,
    );
    const badge = screen.getByText("잔금");
    expect(badge.className).toContain("text-payment-balance");
    expect(badge.className).not.toContain("text-primary");
    expect(badge.className).toContain("bg-surface");
  });

  // `categoryBadgeClass()` 가 모르는 코드에 대해 빈 문자열을 돌려주는 경로가 있다.
  // `??` 만 쓰면 빈 문자열이 통과해 배지가 **색 없이** 나간다.
  it("tone 이 빈 문자열이면 색을 잃지 않고 변이 기본색으로 떨어진다", () => {
    render(<Badge tone="">모르는 카테고리</Badge>);
    expect(screen.getByText("모르는 카테고리").className).toContain("bg-primary-soft");
  });

  it("className 은 색이 아닌 것만 받는다 — 형태·색과 함께 붙는다", () => {
    render(<Badge className="mt-0.5">티어</Badge>);
    const badge = screen.getByText("티어");
    expect(badge.className).toContain("mt-0.5");
    expect(badge.className).toContain("bg-primary-soft");
  });
});
