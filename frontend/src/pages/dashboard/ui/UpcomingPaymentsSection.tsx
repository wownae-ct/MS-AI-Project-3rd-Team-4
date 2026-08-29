// "다가오는 납부" 카드 — 대시보드 전용 데이터 로딩 래퍼. BudgetPage.tsx가 이미 쓰던
// getUpcomingPayments()를 대시보드에도 그대로 노출한다(2026-08-26, UX 개편 2차, 사용자 지시).
// "다가오는 할 일"(PaymentRow — timeline/checklist 혼합 피드, 금액 없음)과는 다른 카드다 —
// 이건 실제 결제 예정(금액 포함) 데이터다. `import/max-dependencies`(10) 상한 때문에
// DashboardPage.tsx가 아니라 이 조회를 이 파일이 직접 담당한다.
import { useEffect, useState } from "react";
import { getUpcomingPayments, UpcomingPaymentsCard, type UpcomingPaymentEntry } from "@/entities/payment";
import { Card, Loading, SkeletonRows } from "@/shared/ui";

// BudgetPage.tsx의 같은 이름 상수와 값이 같다(30일, 서버가 그 창 안의 결제만 계산해서 준다) —
// 프론트가 이 값을 늘려도 실제 대상 결제 개수가 늘지 않는다, 단순 표시 범위 값이다.
const UPCOMING_PAYMENT_WINDOW_DAYS = 30;

export function UpcomingPaymentsSection() {
  const [payments, setPayments] = useState<UpcomingPaymentEntry[] | null>(null);
  // `payments === null` 하나로는 **"아직 안 왔다"와 "영영 안 온다"를 구분할 수 없다.**
  // 예전엔 둘 다 아무것도 안 그려서 문제가 없었지만, 지금은 로딩 중에 자리를 잡아 두므로
  // 실패를 구분하지 않으면 그 자리표시가 **영원히 남는다**(조용한 실패가 눈에 띄는 고장이 된다).
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getUpcomingPayments(UPCOMING_PAYMENT_WINDOW_DAYS)
      .then((res) => {
        if (!cancelled) setPayments(res.payments);
      })
      .catch(() => {
        // 다가오는 납부는 보조 위젯이다 — 실패해도 나머지 대시보드 카드는 그대로 보여준다.
        // 에러 배너를 띄우지 않는 기존 정책을 유지하고, 자리만 회수한다.
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;

  if (payments === null) {
    // D14 L2 — 카드가 나중에 끼어들며 아래 내용을 밀어내던 것을 막는다(자리를 먼저 잡는다).
    return (
      <Card title="다가오는 납부">
        <SkeletonRows count={2} />
        <Loading srOnly />
      </Card>
    );
  }

  return <UpcomingPaymentsCard payments={payments} windowDays={UPCOMING_PAYMENT_WINDOW_DAYS} />;
}
