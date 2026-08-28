// "다가오는 결제" 카드 — 원래 BudgetPage.tsx 전용이었으나(oxlint max-lines 300줄 상한 초과로
// 추출) 대시보드도 같은 실제 결제 예정 목록을 보여주게 되며 entities/payment로 승격했다
// (2026-08-26, UX 개편 2차) — 서로 다른 pages/*/ui는 직접 import할 수 없다(FSD 경계).
// D-day 표기는 공용 formatDDay()를 쓴다 — 이 화면이 직접 `D-${...}`를 조립하던 걸 다른 화면들과
// 같은 포맷으로 맞춘다(교차 패턴 01과 같은 클래스의 문제를 예방).
//
// **행 형태를 D-day-먼저로 바꿨다(2026-08-27, 사용자 지시).** 원래 제목→D-day→금액 순이었는데,
// 리포트 탭(S5)의 CompactPaymentRow.tsx가 쓰던 "D-day · 제목" 한 줄 형태가 더 낫다는 요청 —
// 그 컴포넌트는 지우고(리포트 탭 카드 자체를 없앰) 이 공용 컴포넌트를 그 모양으로 맞췄다. 이
// 컴포넌트는 BudgetPage.tsx(S6)도 같이 쓰므로 이 변경은 예산 탭 카드에도 그대로 반영된다
// (사용자 확인 완료).
import type { UpcomingPaymentEntry } from "../model";
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
      <ul className="flex flex-col">
        {payments.map((payment) => (
          <li
            key={payment.id}
            className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm first:pt-0 last:border-b-0 last:pb-0"
          >
            <span className="min-w-0 truncate text-ink-soft">
              <span className="font-bold tabular-nums text-ink">
                {payment.d_day === 0 ? "오늘" : formatDDay(payment.d_day)}
              </span>{" "}
              · {payment.item_name}
            </span>
            <Money value={payment.amount} className="shrink-0 text-sm" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
