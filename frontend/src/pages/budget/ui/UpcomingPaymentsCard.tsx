// "다가오는 결제" 카드 — BudgetPage.tsx에서 뽑아냈다(oxlint max-lines 300줄 상한 초과, 레드팀
// 감사 수정 배치로 에러 메시지/저장 가드 로직이 늘어나면서 넘김). D-day 표기는 공용
// formatDDay()를 쓴다 — 이 화면이 직접 `D-${...}`를 조립하던 걸 다른 화면들과 같은 포맷으로
// 맞춘다(교차 패턴 01과 같은 클래스의 문제를 예방).
import type { UpcomingPaymentEntry } from "@/entities/payment";
import { formatDDay } from "@/shared/lib/format-d-day";
import { Card, Money } from "@/shared/ui";

export interface UpcomingPaymentsCardProps {
  payments: UpcomingPaymentEntry[];
  windowDays: number;
}

export function UpcomingPaymentsCard({ payments, windowDays }: UpcomingPaymentsCardProps) {
  if (payments.length === 0) return null;
  return (
    <Card title={`다가오는 결제 · ${windowDays}일 이내`}>
      <ul className="flex flex-col gap-2">
        {payments.map((payment) => (
          <li key={payment.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink">{payment.item_name}</span>
            <span className="flex-none text-xs text-ink-soft">
              {payment.d_day === 0 ? "오늘" : formatDDay(payment.d_day)}
            </span>
            <Money value={payment.amount} className="flex-none text-sm" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
