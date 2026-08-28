// 트러블슈팅 STEP 8 회귀 테스트 — 화면 부제("D-12개월부터...")가 실제 최상단 구간 라벨과
// 어긋나던 문제. 부제는 이제 화면에 렌더되는 groups[0]의 라벨에서 동적으로 만든다.
import { describe, expect, it } from "vitest";
import type { TimelineItem } from "@/entities/timeline";
import type { TimelinePhaseGroup } from "./group-by-phase";
import { resolveCategoryLabel, timelineRegenerateImpact, timelineSubtitle } from "./TimelinePage";

function group(label: string): TimelinePhaseGroup {
  return { label, sortKey: 0, date: "2026-01-01", items: [] };
}

describe("timelineSubtitle", () => {
  it("최상단 구간 라벨을 그대로 반영한다(고정 D-12개월이 아니다)", () => {
    expect(timelineSubtitle([group("D-9개월"), group("D-6개월")])).toBe(
      "D-9개월부터 결혼식 당일까지, 비활성 카테고리는 제외됩니다",
    );
  });

  it("구간이 없으면(빈 목록) 날짜 범위 없이 일반 문구만 낸다", () => {
    expect(timelineSubtitle([])).toBe("비활성 카테고리는 제외됩니다");
  });

  it("웨딩 날짜 미정이라 전부 '일정 미정' 그룹뿐이면 날짜 범위 없이 일반 문구만 낸다", () => {
    expect(timelineSubtitle([group("일정 미정")])).toBe("비활성 카테고리는 제외됩니다");
  });
});

describe("resolveCategoryLabel", () => {
  it("STEP 10 — 매핑에 있는 코드는 한글 라벨(name_ko)로 바뀐다(원시 ENUM 코드 노출 방지)", () => {
    const map = new Map([["VENUE", "예식장"]]);
    expect(resolveCategoryLabel("VENUE", map)).toBe("예식장");
  });

  it("category_code가 null이면(범용 항목) null을 그대로 유지한다", () => {
    expect(resolveCategoryLabel(null, new Map())).toBeNull();
  });

  it("매핑에 없는 코드(카테고리 목록 조회 실패 등)는 원시 코드로 폴백한다", () => {
    expect(resolveCategoryLabel("HOMENEW", new Map())).toBe("HOMENEW");
  });
});

function item(overrides: Partial<TimelineItem>): TimelineItem {
  return {
    id: "item-1",
    category_code: "VENUE",
    origin: "LLM",
    title: "예식장 계약",
    target_date: "2027-03-15",
    status: "TODO",
    date_overridden: false,
    is_overdue: false,
    ...overrides,
  };
}

describe("timelineRegenerateImpact", () => {
  it("완료 체크한 항목은 유지, 나머지는 초기화로 센다", () => {
    const items = [
      item({ id: "a", status: "DONE" }),
      item({ id: "b", status: "TODO" }),
      item({ id: "c", status: "TODO" }),
    ];
    expect(timelineRegenerateImpact(items)).toEqual({ keptCount: 1, resetCount: 2 });
  });

  it("날짜를 직접 바꾼 항목도 유지로 센다(체크하지 않았어도 서버가 남긴다)", () => {
    expect(timelineRegenerateImpact([item({ status: "TODO", date_overridden: true })])).toEqual({
      keptCount: 1,
      resetCount: 0,
    });
  });

  it("직접 추가만 하고 손대지 않은 항목은 초기화로 센다 — 실제로 지워진다", () => {
    expect(timelineRegenerateImpact([item({ origin: "USER", status: "TODO" })])).toEqual({
      keptCount: 0,
      resetCount: 1,
    });
  });

  it("빈 목록이면 둘 다 0이다", () => {
    expect(timelineRegenerateImpact([])).toEqual({ keptCount: 0, resetCount: 0 });
  });
});
