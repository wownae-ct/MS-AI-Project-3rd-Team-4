// 구간 그룹핑·표시 순서 회귀 테스트.
//
// 이 파일이 생기기 전엔 `group-by-phase.ts`에 테스트가 하나도 없었다 — 완료 체크가 표시 순서를
// 바꾸던 동작(sortDoneLast + pending/done 그룹 분리)도 무검증 상태였다. 이 화면엔 사용자가 고를 수
// 있는 정렬 기능이 없으므로 **표시 순서는 target_date 하나로 고정**이고, status는 순서에 절대
// 영향을 주지 않는다(2026-08-29 사용자 지시). 아래 첫 두 describe가 그 불변식을 지킨다.
import { describe, expect, it } from "vitest";
import type { TimelineItem } from "@/entities/timeline";
import { groupTimelineItemsByPhase, type TimelinePhaseGroup } from "./group-by-phase";

const WEDDING_DATE = "2027-05-15";
/** 온보딩에서 "미정"을 고른 경우 — `weddingDate` 인자가 `undefined`로 온다. */
const NO_WEDDING_DATE: string | undefined = undefined;

function item(id: string, targetDate: string, status: TimelineItem["status"] = "TODO"): TimelineItem {
  return {
    id,
    category_code: "VENUE",
    origin: "LLM",
    title: `${id} 항목`,
    target_date: targetDate,
    status,
    date_overridden: false,
    is_overdue: false,
  };
}

/** 화면에 렌더되는 순서 그대로를 비교 가능한 형태로 납작하게 편다. */
function layout(groups: TimelinePhaseGroup[]): { label: string; ids: string[] }[] {
  return groups.map((group) => ({ label: group.label, ids: group.items.map((i) => i.id) }));
}

// 서버가 주는 순서(target_date 오름차순, backend/app/services/timeline.py) 그대로.
// 구간 경계: D-1개월 = offset -1..-30, D-2개월 = -31..-60 (ceil(-offset/30) 공식).
function baseItems(doneIds: string[] = []): TimelineItem[] {
  const dates: [string, string][] = [
    ["m2-a", "2027-03-16"], // offset -60 → D-2개월
    ["m2-b", "2027-04-14"], // offset -31 → D-2개월
    ["m1-a", "2027-04-15"], // offset -30 → D-1개월
    ["m1-b", "2027-05-10"], // offset  -5 → D-1개월
    ["dday", "2027-05-15"], // offset   0 → 결혼식 당일
    ["after", "2027-06-01"], // offset +17 → 결혼식 이후
  ];
  return dates.map(([id, date]) => item(id, date, doneIds.includes(id) ? "DONE" : "TODO"));
}

describe("groupTimelineItemsByPhase — 완료 체크는 순서를 바꾸지 않는다", () => {
  it("항목 하나를 완료로 바꿔도 구간 순서·구간 안 항목 순서가 그대로다", () => {
    const before = layout(groupTimelineItemsByPhase(baseItems(), WEDDING_DATE));

    expect(layout(groupTimelineItemsByPhase(baseItems(["m1-a"]), WEDDING_DATE))).toEqual(before);
  });

  it("구간 안 첫 항목을 완료로 바꿔도 그 항목이 아래로 내려가지 않는다", () => {
    const groups = groupTimelineItemsByPhase(baseItems(["m2-a"]), WEDDING_DATE);

    expect(groups[0].items.map((i) => i.id)).toEqual(["m2-a", "m2-b"]);
  });

  it("구간 전체가 완료여도 그 구간 카드가 아래로 내려가지 않는다(날짜순 자리 유지)", () => {
    const groups = groupTimelineItemsByPhase(baseItems(["m2-a", "m2-b"]), WEDDING_DATE);

    expect(groups.map((g) => g.label)).toEqual([
      "D-2개월",
      "D-1개월",
      "결혼식 당일 (D-DAY)",
      "결혼식 이후",
    ]);
  });

  it("모든 항목이 완료여도 순서는 전부 그대로다", () => {
    const before = layout(groupTimelineItemsByPhase(baseItems(), WEDDING_DATE));
    const allDone = baseItems(["m2-a", "m2-b", "m1-a", "m1-b", "dday", "after"]);

    expect(layout(groupTimelineItemsByPhase(allDone, WEDDING_DATE))).toEqual(before);
  });
});

describe("groupTimelineItemsByPhase — 표시 순서는 target_date 하나로 정해진다", () => {
  it("입력 순서가 섞여 있어도 구간 안 항목은 날짜 오름차순으로 나온다", () => {
    const shuffled = [
      item("m1-b", "2027-05-10"),
      item("m2-b", "2027-04-14"),
      item("m1-a", "2027-04-15"),
      item("m2-a", "2027-03-16"),
    ];

    expect(layout(groupTimelineItemsByPhase(shuffled, WEDDING_DATE))).toEqual([
      { label: "D-2개월", ids: ["m2-a", "m2-b"] },
      { label: "D-1개월", ids: ["m1-a", "m1-b"] },
    ]);
  });

  it("같은 날짜 항목끼리는 받은 순서를 유지한다(안정 정렬)", () => {
    const sameDay = [item("second", "2027-05-10"), item("first", "2027-05-10", "DONE")];

    expect(groupTimelineItemsByPhase(sameDay, WEDDING_DATE)[0].items.map((i) => i.id)).toEqual([
      "second",
      "first",
    ]);
  });
});

describe("groupTimelineItemsByPhase — 웨딩 날짜 미정", () => {
  it("전부 '일정 미정' 한 그룹으로 묶이고, 완료 여부와 무관하게 날짜순으로 나온다", () => {
    const items = [item("c", "2027-05-10"), item("a", "2027-03-16"), item("b", "2027-04-14", "DONE")];
    const groups = groupTimelineItemsByPhase(items, NO_WEDDING_DATE);

    expect(layout(groups)).toEqual([{ label: "일정 미정", ids: ["a", "b", "c"] }]);
    expect(groups[0].date).toBeUndefined();
  });

  it("항목이 없으면 빈 배열이다(빈 카드를 만들지 않는다)", () => {
    expect(groupTimelineItemsByPhase([], NO_WEDDING_DATE)).toEqual([]);
  });
});

describe("groupTimelineItemsByPhase — 라벨 공식과 구간 대표 날짜", () => {
  it("offset을 ceil(-offset/30)으로 묶어 D-N개월 라벨을 만든다(경계 포함)", () => {
    const items = [
      item("d60", "2027-03-16"), // -60 → D-2개월
      item("d31", "2027-04-14"), // -31 → D-2개월
      item("d30", "2027-04-15"), // -30 → D-1개월
      item("d1", "2027-05-14"), //   -1 → D-1개월
      item("d0", "2027-05-15"), //    0 → 당일
      item("after", "2027-06-01"), // +17 → 이후
    ];

    expect(groupTimelineItemsByPhase(items, WEDDING_DATE).map((g) => g.label)).toEqual([
      "D-2개월",
      "D-1개월",
      "결혼식 당일 (D-DAY)",
      "결혼식 이후",
    ]);
  });

  it("구간 대표 날짜는 그 구간에 실제로 있는 항목 중 가장 이른 날짜다(날짜를 지어내지 않는다)", () => {
    const groups = groupTimelineItemsByPhase(baseItems(), WEDDING_DATE);

    expect(groups.map((g) => g.date)).toEqual([
      "2027-03-16",
      "2027-04-15",
      "2027-05-15",
      "2027-06-01",
    ]);
  });
});
