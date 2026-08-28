// "다가오는 납부" 카드 — 대시보드 전용 데이터 로딩 래퍼. BudgetPage.tsx가 이미 쓰던
// getUpcomingPayments()를 대시보드에도 그대로 노출한다(2026-08-26, UX 개편 2차, 사용자 지시).
// "다가오는 할 일"(PaymentRow — timeline/checklist 혼합 피드, 금액 없음)과는 다른 카드다 —
// 이건 실제 결제 예정(금액 포함) 데이터다. `import/max-dependencies`(10) 상한 때문에
// DashboardPage.tsx가 아니라 이 조회를 이 파일이 직접 담당한다.
import { useEffect, useState } from "react";
import { getUpcomingPayments, UpcomingPaymentsCard, type UpcomingPaymentEntry } from "@/entities/payment";

// BudgetPage.tsx의 같은 이름 상수와 값이 같다(30일, 서버가 그 창 안의 결제만 계산해서 준다) —
// 프론트가 이 값을 늘려도 실제 대상 결제 개수가 늘지 않는다, 단순 표시 범위 값이다.
const UPCOMING_PAYMENT_WINDOW_DAYS = 30;

export function UpcomingPaymentsSection() {
  const [payments, setPayments] = useState<UpcomingPaymentEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUpcomingPayments(UPCOMING_PAYMENT_WINDOW_DAYS)
      .then((res) => {
        if (!cancelled) setPayments(res.payments);
      })
      .catch(() => {
        // 다가오는 납부는 보조 위젯이다 — 실패해도 나머지 대시보드 카드는 그대로 보여준다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (payments === null) return null;
  return <UpcomingPaymentsCard payments={payments} windowDays={UPCOMING_PAYMENT_WINDOW_DAYS} />;
}
