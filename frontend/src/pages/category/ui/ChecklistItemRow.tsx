// ChecklistTab.tsx에서 분리(2026-08-26, oxlint import/max-dependencies 10개 제한 — 근거 배지
// 기능 추가로 ChecklistTab.tsx의 import가 11개가 됐다). ChatPanel.tsx→MessageBubble.tsx 분리와
// 같은 이유·같은 패턴: 재사용 가능한 항목 하나짜리 프레젠테이션 조각을 별도 파일로 뺀다.
import { useState } from "react";
import { type ChecklistItem, type ChecklistStatus } from "@/entities/checklist";
import { ReportButton } from "@/entities/feedback";
import { safeExternalUrl } from "@/shared/lib/safe-url";
import { SOURCE_TIER_LABEL } from "@/shared/lib/source-tier";
import { Badge } from "@/shared/ui";

// HOMEWARE(혼수)만 다른 상태기계를 쓴다 — 03_API_spec.md #12 표. 나머지 8개 카테고리는 공통 4상태.
const HOMEWARE_STATUS_OPTIONS: { value: ChecklistStatus; label: string }[] = [
  { value: "LISTED", label: "목록에 추가" },
  { value: "COMPARING", label: "비교 중" },
  { value: "ORDERED", label: "주문 완료" },
  { value: "DELIVERED", label: "배송 완료" },
];
const DEFAULT_STATUS_OPTIONS: { value: ChecklistStatus; label: string }[] = [
  { value: "TODO", label: "할 일" },
  { value: "DOING", label: "진행 중" },
  { value: "SKIP", label: "건너뜀" },
  { value: "DONE", label: "완료" },
];

function statusOptionsFor(categoryCode: string) {
  return categoryCode === "HOMEWARE" ? HOMEWARE_STATUS_OPTIONS : DEFAULT_STATUS_OPTIONS;
}

interface ChecklistItemRowProps {
  item: ChecklistItem;
  categoryCode: string;
  onStatusChange: (item: ChecklistItem, next: ChecklistStatus) => void;
}

export function ChecklistItemRow({ item, categoryCode, onStatusChange }: ChecklistItemRowProps) {
  // 근거 배지 펼침 상태 — entities/chat/ui/MessageBubble.tsx의 인용 배지와 같은 클릭-펼침 패턴
  // (재사용 요청, dev-e4). 항목 하나당 배지도 하나뿐이라(체크리스트는 채팅과 달리 여러 인용을
  // 동시에 안 붙인다) Set이 아니라 boolean으로 충분하다.
  const [isExpanded, setIsExpanded] = useState(false);

  // origin/source_tier는 독립 필드다(entities/checklist/model.ts 머리말) — 사용자가 직접 추가한
  // 항목(origin=USER)은 출처 등급이 없는 게 정상이라 "내가 추가"로 명시하고, source_tier가
  // null인데 LLM 생성 항목이면(카탈로그 폴백이거나 DS3 근거를 못 찾은 항목) 등급 배지 자체를
  // 생략한다 — 빈 배지나 "null" 텍스트를 보여주지 않는다.
  const tierLabel = item.source_tier === null ? null : (SOURCE_TIER_LABEL[item.source_tier] ?? item.source_tier);
  const safeUrl = item.source_url ? safeExternalUrl(item.source_url) : undefined;

  return (
    <li className="flex flex-col gap-1 border-b border-line pb-3 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-bold text-ink">{item.title}</p>
        {item.origin === "USER" ? (
          <Badge>내가 추가</Badge>
        ) : (
          tierLabel !== null && (
            // entities/chat/ui/MessageBubble.tsx 인용 배지와 같은 패턴 — 티어만 보여주면 어떤
            // 근거인지 알 수 없어 라벨도 함께 보여주고, 클릭하면 원문 링크(있으면)를 펼친다.
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-label={`근거 자세히 보기: ${tierLabel} · ${item.source_label}`}
              onClick={() => setIsExpanded((prev) => !prev)}
              className="min-h-tap max-w-[160px] shrink-0 rounded-pill border-none bg-transparent p-0 text-left enabled:hover:opacity-80"
            >
              <Badge className="w-full truncate bg-bg text-ink-soft" title={`${tierLabel} · ${item.source_label}`}>
                {tierLabel} · {item.source_label}
              </Badge>
            </button>
          )
        )}
      </div>
      <p className="break-words text-xs text-ink-soft">{item.body}</p>
      {isExpanded && tierLabel !== null && (
        <div className="rounded-md border border-line bg-bg px-3 py-2 text-xs text-ink-soft">
          <p className="font-bold text-ink">
            {tierLabel} · {item.source_label}
          </p>
          {safeUrl ? (
            <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-primary underline">
              원문 보기
            </a>
          ) : (
            // source_url이 null인 경우 — CONSENSUS/자체 저작 콘텐츠나 카탈로그 폴백 항목이라
            // 원문 링크가 없는 게 정상이다(entities/checklist/model.ts 머리말과 같은 원칙,
            // MessageBubble.tsx와 동일 문구로 통일).
            <p className="mt-1">팀에서 직접 정리한 자료라 원문 링크는 없어요.</p>
          )}
        </div>
      )}
      <div className="mt-1 flex items-center gap-2">
        <select
          value={item.status}
          aria-label={`${item.title} 상태`}
          onChange={(e) => onStatusChange(item, e.target.value as ChecklistStatus)}
          className="min-h-tap w-fit rounded-md border border-line bg-surface px-2 text-base text-ink"
        >
          {statusOptionsFor(categoryCode).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {/* 신고(F13)는 AI가 생성한 항목에만 의미가 있다 — 사용자가 직접 추가한 항목(origin=USER)은
            본인 입력이라 신고 대상이 아니다. */}
        {item.origin === "LLM" && <ReportButton targetType="CHECKLIST_ITEM" targetId={item.id} />}
      </div>
    </li>
  );
}
