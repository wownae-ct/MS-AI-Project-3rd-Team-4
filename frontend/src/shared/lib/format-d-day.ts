// D-day 표시 포맷 — `pages/dashboard`(헤드라인·PaymentRow)와 `pages/report`(CompactPaymentRow)가
// 각각 `D-${dDay}`를 직접 문자열로 조립하다가, 연체(dDay<0)일 때 "D--8"처럼 마이너스가 겹쳐
// 렌더되는 버그가 세 곳에서 독립적으로 재현됐다(레드팀 감사 교차 패턴 01). 공용 포맷 함수 하나로
// 모은다 — 연체는 "D+n"으로 부호를 뒤집어 보여준다(국내 D-day 표기 관례).
export function formatDDay(dDay: number): string {
  if (dDay === 0) return "D-DAY";
  if (dDay > 0) return `D-${dDay}`;
  return `D+${Math.abs(dDay)}`;
}
