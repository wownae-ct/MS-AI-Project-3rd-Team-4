// S5 리포트 계약 (시각 스펙: docs/mockups/s5-report.html).
//
// **무엇을 테스트하고 무엇을 테스트하지 않는가**
// 색·라운드·그림자는 빌드 게이트(산출 CSS 파서)가, 유령 유틸리티는 ghost-candidates 가 이미
// 강제한다 — 여기서 클래스를 단언하지 않는다. 여기서 고정하는 것은 **그 게이트들이 볼 수 없는 것**뿐이다:
// 문서 구조(제목 레벨) · 접근명 · 화면이 주장하는 순서 · 데이터 사이의 정합성 · 셸과의 소유 경계.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CATEGORY_BUDGETS, RECOMMENDED_CHECKS } from "@/entities/wedding";
import { ReportPage } from "./ReportPage";

describe("카드 구조", () => {
  // 목업의 카드 4개(s5:81,90,101,133)는 굵은 <p> 지만 규범은 h2 다(a11y.md §4 — WCAG 1.3.1 F2).
  it("카드 4개가 각각 레벨 2 제목을 갖는다", () => {
    render(<ReportPage />);

    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(["예산", "카테고리별 진행률", "다음에 확인하면 좋아요", "다가오는 납부"]);
  });

  // 부제는 제목이 아니다 — heading 이 되면 제목 탐색 항목이 늘고 카드 계층이 흐려진다.
  // Card 의 슬롯 계약이지만 **실제로 쓰는 화면에서** 한 번 더 고정한다.
  it("추천 카드의 부제는 제목이 아니다", () => {
    render(<ReportPage />);

    expect(screen.getByText("기한이 가까운 순으로 5개만 골랐어요").tagName).toBe("P");
  });
});

describe("카테고리별 진행률", () => {
  // role="progressbar" 는 접근명이 필수다(WAI-ARIA 1.2 — name required).
  // 바가 7개라 이름이 겹치면 스크린리더에서 구분되지 않는다.
  it("바마다 어느 카테고리인지 말한다 — 접근명이 서로 다르다", () => {
    render(<ReportPage />);

    const names = screen.getAllByRole("progressbar").map((bar) => bar.getAttribute("aria-label"));

    expect(names).toHaveLength(CATEGORY_BUDGETS.length);
    expect(new Set(names).size).toBe(names.length);
  });

  // S2 와 뜻이 다르다는 것을 고정한다. S2 는 예산 집행률이라 예산이 없는 상견례에 바가 없었지만,
  // 여기는 체크리스트 진행률(3/5)이므로 **있어야 한다.** 두 화면을 같은 규칙으로 착각하면 사라진다.
  it("예산이 없는 카테고리도 바를 갖는다 — 여기 기준은 체크리스트다", () => {
    render(<ReportPage />);

    const names = screen.getAllByRole("progressbar").map((bar) => bar.getAttribute("aria-label"));
    expect(names).toContain("상견례 준비 진행률");
  });

  // 목업 행 순서(s5:91-97)가 곧 진행률 내림차순이다. 정렬을 잃으면 「리포트」가 아니라 목록이 된다.
  it("진행률이 높은 순으로 나열한다", () => {
    render(<ReportPage />);

    const percents = screen
      .getAllByText(/^\d+%$/u)
      .map((el) => Number(el.textContent?.replace("%", "")));

    expect(percents).toEqual([...percents].toSorted((a, b) => b - a));
    expect(percents[0]).toBe(60);
  });
});

describe("다음에 확인하면 좋아요", () => {
  // 추천 항목은 카테고리를 id 로 참조한다(이름 복제 금지). 그 참조가 깨져도 타입은 통과하므로
  // 여기가 유일한 방어선이다. 데이터 자체를 보므로 렌더가 필요 없다.
  it("모든 추천 항목이 실제 카테고리를 가리킨다", () => {
    const ids = new Set(CATEGORY_BUDGETS.map((category) => category.id));

    expect(RECOMMENDED_CHECKS.filter((check) => !ids.has(check.categoryId))).toEqual([]);
  });

  // 위 참조가 깨지면 화면은 이름 대신 id 를 그린다(폴백). 그 상태가 조용히 배포되지 않게 막는다.
  it("화면에 카테고리 id 가 새어 나오지 않는다", () => {
    render(<ReportPage />);

    for (const category of CATEGORY_BUDGETS) {
      expect(screen.queryByText(category.id)).not.toBeInTheDocument();
    }
  });
});

describe("셸과 화면의 경계", () => {
  // 목업은 셸이 없던 시절 사본이라 브랜드가 화면 안에 있다. layout.md §4 는 사이드바 소관으로 뒀다.
  it("브랜드를 화면이 그리지 않는다 — 셸 소관이다", () => {
    render(<ReportPage />);

    expect(screen.queryByText("메리맵")).not.toBeInTheDocument();
  });
});
