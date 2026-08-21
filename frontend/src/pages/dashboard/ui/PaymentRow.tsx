// 다가오는 납부 한 줄 (시각 스펙: docs/mockups/s2-dashboard.html:188-195).
//
// **구분선을 행이 스스로 그린다** — `first:pt-0 last:border-b-0 last:pb-0`.
// 목업의 `.pay-row:first-child` / `:last-child` 규칙(s2:102-103)을 그대로 옮긴 것이다.
// ⚠️ 이 변이는 **형제 중 첫/마지막**을 본다. 카드가 `<h2>` 제목을 먼저 렌더하므로 행들을
// **별도 컨테이너로 감싸야** 첫 행이 `:first-child` 가 된다 — 감싸지 않으면 첫 행에 위 패딩이 남는다.
//
// 5개 화면 7곳이 같은 구분선 리스트를 요구하지만(목업 인벤토리) 공용 `DividedList` 로 빼지 않았다 —
// 반복 행을 `<ul>/<li>` 로 낼지가 아직 미정이기 때문이다(a11y.md §5 「목록 시맨틱」).
// 지금 빼면 결정이 뒤집힐 때 7곳이 함께 바뀐다. 그때까지 파급을 이 화면 안에 가둬 둔다.
import { Badge, Money } from "@/shared/ui";
import type { UpcomingPayment } from "../model/sample-data";

export interface PaymentRowProps {
  payment: UpcomingPayment;
}

export function PaymentRow({ payment }: PaymentRowProps) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
      {/* D-Day 는 규범이 정의한 배지 하나(primary-soft / primary / pill)와 정확히 같다 — 변이가 필요 없다. */}
      <Badge className="shrink-0 tabular-nums">D-{payment.dDay}</Badge>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">{payment.item}</p>
        {/* 카테고리명이 길면 줄바꿈 대신 말줄임 — 목업의 text-overflow:ellipsis(s2:113). */}
        <p className="truncate text-xs text-ink-soft">
          {payment.category} · {payment.date}
        </p>
      </div>

      <Money value={payment.amount} className="shrink-0 text-sm" />
    </div>
  );
}
