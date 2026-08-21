// Card 타이틀 슬롯 계약.
//
// 목업 3화면이 같은 모양을 요구한다 — S2 `s2-dashboard.html:68` · S3 `s3-category-detail.html:77`
// · S5 `s5-report.html:35`. 카드마다 제목 마크업을 손으로 적으면 레벨이 화면마다 갈린다.
//
// **왜 빌드 게이트가 아니라 여기인가**: 이 저장소는 색·라운드·그림자를 산출 CSS 파서로 강제한다
// (scripts/lib/css-norms.mjs). 그러나 **제목 레벨은 산출 CSS 에 나타나지 않는다** — 문서 구조는
// CSS 검사의 대상이 아니다. AppShell 의 내비 계약이 테스트로 간 것과 같은 이유로 여기가 그 게이트다.
//
// **레벨이 계약인 이유**: `Page` 가 화면당 `<h1>` 을 정확히 하나 렌더한다(Page.tsx). 카드 제목이
// `<h1>` 이면 화면에 h1 이 여러 개가 되어 "이 화면은 무엇인가"가 무의미해지고, 반대로 heading 이
// 아닌 그냥 굵은 텍스트면 스크린리더의 제목 탐색(rotor)에서 카드가 통째로 사라진다.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card 타이틀 슬롯", () => {
  it("title 을 주면 레벨 2 제목으로 렌더한다 — Page 의 h1 아래 단계다", () => {
    render(<Card title="다가오는 납부">내용</Card>);

    expect(screen.getByRole("heading", { level: 2, name: "다가오는 납부" })).toBeInTheDocument();
  });

  // title 이 없는 카드가 이미 여러 곳에 있다(스타일가이드·대시보드 스캐폴드).
  // 슬롯을 추가하면서 그 카드들이 빈 heading 을 얻으면 제목 탐색이 빈 항목으로 오염된다.
  it("title 이 없으면 제목을 만들지 않는다", () => {
    render(<Card>내용만 있는 카드</Card>);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("title 이 있어도 children 은 그대로 렌더한다", () => {
    render(<Card title="예산 요약">45,000,000원</Card>);

    expect(screen.getByText("45,000,000원")).toBeInTheDocument();
  });
});
