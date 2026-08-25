// 타임라인 항목 한 줄 — 시각 스펙: docs/mockups/s4-timeline.html.
//
// 기한 지난 미완료 항목은 **아이콘(느낌표 원) + 굵은 텍스트**로 표시한다(HANDOFF.md §4 S4) —
// 색으로 표현하지 않는다(D6, docs/design/decisions.md — 상태색을 도입하지 않기로 닫힌 결정).
// `shared/ui`엔 경고 전용 아이콘이 따로 없어 `IconInfo`를 재사용한다 — 이 화면 하나 때문에
// 새 아이콘을 들이지 않는다(YAGNI, 이 저장소 CLAUDE.md).
import { patchTimelineItem, type TimelineItem } from "@/entities/timeline";
import { IconInfo } from "@/shared/ui";

export interface TimelineItemRowProps {
  item: TimelineItem;
  /** null — 혼인신고·본식처럼 카테고리가 없는 항목(entities/timeline/model.ts 머리말 참조). */
  categoryLabel: string | null;
  /** 낙관적 갱신 후 실패 시 되돌리기 위해, 갱신된 항목을 부모 state에 반영하는 콜백. */
  onStatusChange: (item: TimelineItem) => void;
}

export function TimelineItemRow({ item, categoryLabel, onStatusChange }: TimelineItemRowProps) {
  const isDone = item.status === "DONE";

  async function handleToggle() {
    const nextStatus = isDone ? "TODO" : "DONE";
    const previous = item;
    onStatusChange({ ...item, status: nextStatus }); // 낙관적 갱신
    try {
      const updated = await patchTimelineItem(item.id, { status: nextStatus });
      onStatusChange(updated);
    } catch {
      onStatusChange(previous); // 실패 시 되돌림
    }
  }

  return (
    <div className="flex items-center gap-2.5 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
      {/* 네이티브 checkbox — `pages/category/ui/ChecklistTab.tsx`가 세운 관례 그대로(role="checkbox"인
          커스텀 버튼 대신 실제 input을 쓴다, jsx-a11y prefer-tag-over-role).
          목업은 기한 지난 항목에만 완료 버튼을 주고 나머지는 빈 원(비인터랙티브)이지만, 모든 행을
          체크 가능하게 두는 쪽으로 사용자에게 직접 확인받았다(2026-08-24) — 지난 일만 체크할 수
          있으면 미리 끝낸 일을 표시할 방법이 없어 실사용성이 떨어진다는 판단. 실수가 아니라
          의도된 목업 이탈이다. */}
      <input
        type="checkbox"
        checked={isDone}
        onChange={handleToggle}
        aria-label={`${item.title} 완료 여부`}
        className="size-4 flex-none"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {item.is_overdue && (
            // 아이콘 자체는 장식용(aria-hidden, icons.tsx 기본값)이라 sr-only 텍스트로 뜻을 보강한다
            // — "느낌표 아이콘이 있다"가 아니라 "기한이 지났다"를 스크린리더가 읽어야 한다.
            <span title="기한이 지났어요" className="flex-none text-primary">
              <IconInfo size={16} />
              <span className="sr-only">기한이 지났어요</span>
            </span>
          )}
          <p className={`truncate text-sm ${item.is_overdue ? "font-bold text-ink" : "text-ink"} ${isDone ? "line-through text-ink-soft" : ""}`}>
            {item.title}
          </p>
        </div>
        <p className="text-xs text-ink-soft">
          {categoryLabel === null ? "" : `${categoryLabel} · `}
          {item.target_date}
        </p>
      </div>
    </div>
  );
}
