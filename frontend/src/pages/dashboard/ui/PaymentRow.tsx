// 다가오는 할 일 한 줄 (시각 스펙: docs/mockups/s2-dashboard.html:188-195, 원래는 "다가오는 납부").
//
// **`amount`(금액)를 받지 않는다.** `GET /dashboard/summary`(API 스펙 §25)의 `upcoming_items`는
// `timeline_items`(마감일만 있고 금액 없음)와 `checklist_items`(상태만 있고 날짜·금액 둘 다 없음)를
// 합친 피드다 — 구 sample-data의 `UpcomingPayment.amount`에 대응하는 값이 API 어느 변형에도 없다.
// 금액을 요구하는 카드 제목("다가오는 납부")도 더는 맞지 않아 `DashboardPage`에서 "다가오는 할
// 일"로 고쳤다. `entities/wedding`의 `UpcomingPayment` 타입(S5 리포트가 여전히 씀)은 그대로 두고,
// 이 컴포넌트만 실제 API 유니온(`DashboardUpcomingItem`)을 직접 받는다 — 없는 금액을 0이나 빈
// 문자열로 지어내는 대신, 애초에 그 슬롯을 렌더하지 않는 쪽을 택했다(지어내지 않는다).
import type { DashboardUpcomingItem } from "@/entities/dashboard";
import { formatDDay } from "@/shared/lib/format-d-day";
import { Badge } from "@/shared/ui";

export interface PaymentRowProps {
  item: DashboardUpcomingItem;
  /** `category_code` → `name_ko` 해석은 페이지가 한다(카테고리 목록을 이미 갖고 있으므로 중복 조회 안 함). */
  categoryLabel: string;
}

// 체크리스트 쪽 상태값 3종만 이 피드에 나온다 — API 스펙 §25 "upcoming_items" 설명의
// `checklist_items(status IN ('DOING','COMPARING','ORDERED'))` 그대로. 나머지 상태(TODO/DONE 등)는
// 애초에 이 목록에 들어오지 않으므로 라벨을 만들지 않는다.
const CHECKLIST_STATUS_LABEL: Record<string, string> = {
  DOING: "진행 중",
  COMPARING: "비교 중",
  ORDERED: "주문 완료",
};

export function PaymentRow({ item, categoryLabel }: PaymentRowProps) {
  const badgeText = item.source === "timeline" ? formatDDay(item.d_day) : (CHECKLIST_STATUS_LABEL[item.status] ?? item.status);
  const subLabel = item.source === "timeline" ? `${categoryLabel} · ${item.target_date}` : `${categoryLabel} · 체크리스트`;

  return (
    <div className="flex items-center gap-3 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
      <Badge className="shrink-0 tabular-nums">{badgeText}</Badge>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">{item.title}</p>
        {/* 카테고리명이 길면 줄바꿈 대신 말줄임 — 목업의 text-overflow:ellipsis(s2:113). */}
        <p className="truncate text-xs text-ink-soft">{subLabel}</p>
      </div>
    </div>
  );
}
