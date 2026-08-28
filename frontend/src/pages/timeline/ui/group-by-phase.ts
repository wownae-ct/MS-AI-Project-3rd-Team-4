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
 * 표시 순서는 `target_date` 오름차순 **하나뿐**이다 — status는 순서에 영향을 주지 않는다
 * (2026-08-29 사용자 지시).
 *
 * 예전엔 여기서 완료(DONE) 항목을 구간 맨 아래로 내리고, 구간 전체가 DONE이면 그 구간 카드까지
 * 아래로 보냈다(2026-08-26 지시). **그 결정은 철회됐다** — 이 화면엔 사용자가 고를 수 있는 정렬
 * 컨트롤이 없어서, 체크 한 번에 목록이 재배치되면 순서가 왜 바뀌었는지 알 방법이 없다. 게다가
 * 타임라인 체크는 대개 연속으로 일어나는데(밀린 항목 몰아서 정리) 방금 누른 행이 즉시 자리를
 * 옮기고 다음 행이 그 자리로 당겨 올라와 오클릭이 났다. 완료 여부는 순서가 아니라 행의 모양
 * (취소선 + 회색, `TimelineItemRow.tsx`)으로만 표현한다 — `ChecklistTab.tsx`와 같은 관례다.
 *
 * 서버도 이미 `target_date` 순으로 주지만(backend/app/services/timeline.py) 여기서 한 번 더
 * 고정한다 — "순서는 날짜뿐"이 이 파일 안에서 자립적으로 성립해야 테스트로 지킬 수 있다.
 * `target_date`는 전부 ISO `YYYY-MM-DD`라 사전식 비교가 곧 시간순이고, `toSorted`는 안정
 * 정렬이라 같은 날짜끼리는 받은 순서를 유지한다.
 */
function sortByTargetDate(items: TimelineItem[]): TimelineItem[] {
  return items.toSorted((a, b) => a.target_date.localeCompare(b.target_date));
}

/**
 * 웨딩 날짜가 없으면(온보딩에서 "미정" 선택) offset을 계산할 기준이 없다 — 이 경우 전부 한 그룹
 * "일정 미정"으로 묶는다. 날짜를 지어내지 않는다(ADR 0006과 같은 원칙).
 */
export function groupTimelineItemsByPhase(items: TimelineItem[], weddingDate: string | undefined): TimelinePhaseGroup[] {
  if (weddingDate === undefined) {
    return items.length > 0
      ? [{ label: "일정 미정", sortKey: 0, date: undefined, items: sortByTargetDate(items) }]
      : [];
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
  // 구간도, 구간 안 항목도 오직 날짜로만 줄 세운다 — 구간 전체가 DONE이 돼도 그 카드는 제자리에
  // 남는다(`sortByTargetDate` 머리말의 철회 근거 참고). `sortKey`는 그 구간에서 처음 만난 항목의
  // offset인데, 서로 다른 라벨은 겹치지 않는 30일 버킷이라 어느 항목을 골라도 구간 순서는 같다.
  const sortedGroups = [...groups.values()].toSorted((a, b) => a.sortKey - b.sortKey);
  for (const group of sortedGroups) group.items = sortByTargetDate(group.items);
  return sortedGroups;
}
