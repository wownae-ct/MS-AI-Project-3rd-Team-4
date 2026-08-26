// 트러블슈팅 STEP 8 회귀 테스트 — 화면 부제("D-12개월부터...")가 실제 최상단 구간 라벨과
// 어긋나던 문제. 부제는 이제 화면에 렌더되는 groups[0]의 라벨에서 동적으로 만든다.
import { describe, expect, it } from "vitest";
import type { TimelinePhaseGroup } from "./group-by-phase";
import { timelineSubtitle } from "./TimelinePage";

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
