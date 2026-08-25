// 압축 납부 행 (시각 스펙: docs/mockups/s5-report.html:132-137).
//
// S2 의 PaymentRow 와 **일부러 공용화하지 않는다** — 같은 데이터를 보지만 모양이 다르다
// (S2 = D-Day 배지 + 2줄 + 업체명, 여기 = 1줄 + 짧은 설명). 억지로 합치면 prop 이 폭발한다.
//
// 짧은 설명은 `compactLabel` 이다. `category` 와 `item` 에서 합성할 수 없다 — 목업의 셋째 행이
// 카테고리(`청첩장·답례품`)가 아니라 `청첩장 인쇄비` 이고, `item` 에는 업체명이 붙어 있어 이 폭에
// 들어가지 않는다(실측: 249.69px vs 최소 카드 내부폭 226.67px). 사유는 entities 의 타입 주석에.
import type { UpcomingPayment } from "@/entities/wedding";
import { formatDDay } from "@/shared/lib/format-d-day";
import { Money } from "@/shared/ui";

export interface CompactPaymentRowProps {
  payment: UpcomingPayment;
}

export function CompactPaymentRow({ payment }: CompactPaymentRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 first:pt-0 last:border-b-0 last:pb-0">
      {/* 넘치면 줄바꿈이 아니라 말줄임 — 행 높이가 들쭉날쭉해지면 목록으로 읽히지 않는다(PaymentRow 와 같은 처리). */}
      <span className="min-w-0 truncate text-sm text-ink-soft">
        <span className="font-bold tabular-nums text-ink">{formatDDay(payment.dDay)}</span> · {payment.compactLabel}
      </span>
      <Money value={payment.amount} className="shrink-0 text-sm" />
    </div>
  );
}
