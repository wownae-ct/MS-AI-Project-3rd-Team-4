// phase 라벨(D-12개월/D-9개월/...) 계산 — `docs/wedding/plan/new/13_personalization_router_agent_design.md`
// §3 "phase_label — 최종 결론"이 정한 공식을 그대로 옮긴다.
//
// **`timeline_items`엔 `phase_label` 컬럼이 없다(v4.0에서 의도적으로 복구 안 함).** 타임라인이
// 이제 LLM 생성이라 offset 값이 원본 55항목 카탈로그의 고정 집합에 한정되지 않아서, 고정 룩업
// 테이블이 아니라 임의의 offset에도 동작하는 일반 공식이 필요했다(문서 §3 근거).
//
// **`GET /timeline-items`(#15) 응답엔 그 공식의 입력인 `default_dday_offset_days`도 없다** —
// `target_date`(절대 날짜)만 준다(entities/timeline/model.ts 머리말). 그래서 여기서는 offset을
// `target_date`와 웨딩 날짜의 차이로 직접 계산한다 — `offsetDays = target_date - wedding_date`
// (며칠 전이면 음수)로 두면 문서의 공식과 값이 동일해진다(그 공식도 결국 본식 기준 며칠 전/후니까).
import type { TimelineItem } from "@/entities/timeline";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH_BUCKET = 30;

function offsetDaysFromWedding(targetDate: string, weddingDate: string): number {
  const target = new Date(`${targetDate}T00:00:00`);
  const wedding = new Date(`${weddingDate}T00:00:00`);
  return Math.round((target.getTime() - wedding.getTime()) / MS_PER_DAY);
}

/** 문서 공식 그대로: `monthsBefore = ceil(-offsetDays / 30)`. */
function phaseLabel(offsetDays: number): string {
  if (offsetDays > 0) return "결혼식 이후";
  if (offsetDays === 0) return "결혼식 당일 (D-DAY)";
  const monthsBefore = Math.ceil(-offsetDays / DAYS_PER_MONTH_BUCKET);
  return `D-${String(monthsBefore)}개월`;
}

export interface TimelinePhaseGroup {
  label: string;
  /** 그룹 정렬용 — 값이 작을수록(결혼식에서 먼 과거) 위에 온다. */
  sortKey: number;
  /**
   * 목업(s4-timeline.html:80)은 구간 헤더에 라벨과 함께 실제 달력 날짜를 보여준다
   * ("D-12개월 · 2026-03-06"). `ceil` 공식상 한 구간엔 서로 다른 실제 날짜의 항목이 여러 개
   * 섞일 수 있어(문서 §3), 구간 자체의 "경계" 날짜를 새로 계산해 넣는 대신 — 그건 어떤 항목과도
   * 대응하지 않는 합성값이라 "날짜를 지어내지 않는다" 원칙에 어긋난다 — 그 구간에 실제로 존재하는
   * 항목들의 `target_date` 중 가장 이른 날짜를 그대로 쓴다. `undefined`는 웨딩 날짜 자체가
   * 없어 offset을 계산 못 하는 "일정 미정" 그룹뿐이다.
   */
  date: string | undefined;
  items: TimelineItem[];
}

/**
 * 완료(DONE) 항목을 그룹 맨 아래로 — 앞으로 할 일이 항상 위에 먼저 보이게 한다(2026-08-26 사용자
 * 지시). `toSorted`는 안정 정렬이라 완료/미완료 각각의 내부 순서(원래 도착 순 = 대체로 날짜순)는
 * 그대로 유지된다 — 완료 여부만 재배치한다.
 */
function sortDoneLast(items: TimelineItem[]): TimelineItem[] {
  return items.toSorted((a, b) => Number(a.status === "DONE") - Number(b.status === "DONE"));
}

/**
 * 웨딩 날짜가 없으면(온보딩에서 "미정" 선택) offset을 계산할 기준이 없다 — 이 경우 전부 한 그룹
 * "일정 미정"으로 묶는다. 날짜를 지어내지 않는다(ADR 0006과 같은 원칙).
 */
export function groupTimelineItemsByPhase(items: TimelineItem[], weddingDate: string | undefined): TimelinePhaseGroup[] {
  if (weddingDate === undefined) {
    return items.length > 0 ? [{ label: "일정 미정", sortKey: 0, date: undefined, items: sortDoneLast(items) }] : [];
  }

  const groups = new Map<string, TimelinePhaseGroup>();
  for (const item of items) {
    const offsetDays = offsetDaysFromWedding(item.target_date, weddingDate);
    const label = phaseLabel(offsetDays);
    const existing = groups.get(label);
    if (existing) {
      existing.items.push(item);
      // 구간 대표 날짜는 그 구간에 실제로 있는 항목 중 가장 이른 날짜 — 문자열 비교로 충분하다
      // (target_date 가 전부 ISO YYYY-MM-DD 라 사전식 순서가 곧 시간 순서다).
      if (item.target_date < existing.date!) existing.date = item.target_date;
    } else {
      groups.set(label, { label, sortKey: offsetDays, date: item.target_date, items: [item] });
    }
  }
  const sortedGroups = [...groups.values()].toSorted((a, b) => a.sortKey - b.sortKey);
  for (const group of sortedGroups) group.items = sortDoneLast(group.items);

  // 구간 자체도 완료 여부로 재배치한다(2026-08-26 사용자 지시) — 각 구간 안에서만 완료 항목을
  // 아래로 내리는 것만으로는, 이미 다 끝난 구간이 여전히 날짜순 그대로 화면 위쪽을 차지해
  // 매번 스크롤을 내려야 남은 할 일을 본다. 미완료 항목이 하나라도 있는 구간을 먼저(날짜순
  // 그대로), 구간 전체가 DONE인 구간을 뒤에(역시 그들끼리는 날짜순 그대로) 이어 붙인다.
  const pending = sortedGroups.filter((group) => group.items.some((item) => item.status !== "DONE"));
  const done = sortedGroups.filter((group) => group.items.every((item) => item.status === "DONE"));
  return [...pending, ...done];
}
