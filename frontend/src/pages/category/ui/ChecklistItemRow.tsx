// ChecklistTab.tsx에서 분리(2026-08-26, oxlint import/max-dependencies 10개 제한 — 근거 배지
// 기능 추가로 ChecklistTab.tsx의 import가 11개가 됐다). ChatPanel.tsx→MessageBubble.tsx 분리와
// 같은 이유·같은 패턴: 재사용 가능한 항목 하나짜리 프레젠테이션 조각을 별도 파일로 뺀다.
import { type ChecklistItem, type ChecklistStatus } from "@/entities/checklist";
import { ReportButton } from "@/entities/feedback";
import { Badge, SourceList } from "@/shared/ui";

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
  // origin/source_tier는 독립 필드다(entities/checklist/model.ts 머리말) — 사용자가 직접 추가한
  // 항목(origin=USER)은 출처 등급이 없는 게 정상이라 "내가 추가"로 명시하고, source_tier가
  // null인데 LLM 생성 항목이면(카탈로그 폴백이거나 DS3 근거를 못 찾은 항목) 근거 줄 자체를
  // 생략한다 — 빈 배지나 "null" 텍스트를 보여주지 않는다.
  const hasSource = item.origin !== "USER" && item.source_tier !== null;

  return (
    <li className="flex flex-col gap-1 border-b border-line pb-3 last:border-0 last:pb-0">
      {/* **[2026-08-29 재배치 — D16]** 종전엔 제목(truncate)과 근거 배지(max-w-[160px] truncate)가
          같은 줄에서 서로 폭을 빼앗아 **둘 다 잘렸다**(사용자 리포트 2026-08-29). 제목은 항목의
          정체성이라 잘리는 손해가 더 크다 — truncate를 걷고 줄바꿈을 허용한다. 근거는 아래 별도
          줄로 내려 전폭을 쓴다. `내가 추가`는 짧은 고정 라벨이라 여기 그대로 두고, Badge 자체가
          이제 안 눌린다(Badge.tsx 계약). */}
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-bold text-ink">{item.title}</p>
        {item.origin === "USER" && <Badge>내가 추가</Badge>}
      </div>
      {/* `break-words` 손패치를 뺐다 — D19 가 조판 규칙(`keep-all` + `break-word`)을 `styles.css`
          의 `body` 로 올려 문서 전체가 상속한다. 호출부에서 다시 걸 이유가 없다. */}
      <p className="text-xs text-ink-soft">{item.body}</p>
      {hasSource && (
        <SourceList
          items={[
            { key: item.id, tier: item.source_tier, title: item.source_label, url: item.source_url },
          ]}
          // source_url이 null인 경우 — CONSENSUS/자체 저작 콘텐츠나 카탈로그 폴백 항목이라 원문
          // 링크가 없는 게 정상이다(entities/checklist/model.ts 머리말과 같은 원칙). SourceList의
          // 기본 문구가 그대로 맞아 따로 넘기지 않는다.
        />
      )}
      {/* flex-wrap — 「신고」를 누르면 `ReportButton` 이 **인라인 폼 전체**(select + input + 버튼 2개)
          로 펼쳐져 이 행의 형제 flex 아이템이 된다. 상태 select 와 나란히 두면 좁은 폭에서 넘치므로
          폼이 자기 줄을 쓰게 한다(그 컴포넌트가 `w-full` 을 갖는다). */}
      <div className="mt-1 flex flex-wrap items-center gap-2">
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
        {/* 신고(F13)는 사용자가 직접 추가하지 않은 항목에만 의미가 있다 — 본인 입력(origin=USER)은
            신고 대상이 아니다. LLM 생성분뿐 아니라 카탈로그 폴백(origin=CATALOG_FALLBACK)도
            시스템이 만든 콘텐츠라 오류가 있으면 똑같이 신고할 수 있어야 한다(2026-08-28,
            origin='LLM' mislabel 수정으로 두 값이 분리되면서 명시적으로 확인). */}
        {item.origin !== "USER" && <ReportButton targetType="CHECKLIST_ITEM" targetId={item.id} />}
      </div>
    </li>
  );
}
