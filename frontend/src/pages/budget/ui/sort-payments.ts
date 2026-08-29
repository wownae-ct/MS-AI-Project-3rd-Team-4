// 「비용 관리」 목록의 기본 정렬 — 2026-08-29, 사용자 지시("예정일 기준으로 기본 맞추세요").
//
// 종전 규칙(`sortByRecency`, 이 파일이 대체한다)은 **정렬 키가 행마다 다른 열**이었다 —
// `paid_date ?? due_date` 내림차순이라 지불완료 건은 결제일로, 예정 건은 예정일로 줄을 섰다.
// 두 축을 한 줄에 섞으니 목록이 「최근 활동순」이 되고, 정작 이 화면에서 알고 싶은
// **"앞으로 언제 얼마를 내야 하는가"** 는 순서에서 읽히지 않았다(임박한 결제가 이미 끝난
// 결제 사이에 묻힌다).
//
// | 순위  | 그룹                          | 정렬 키                  | 방향   |
// |-------|-------------------------------|--------------------------|--------|
// | 1     | 아직 안 낸 건 (PLANNED)       | due_date                 | 오름차순 |
// | 1-b   | 그중 due_date 가 null 인 건   | —                        | 그룹 맨 뒤 |
// | 2     | 끝난 건 (PAID · CANCELED)     | paid_date ?? due_date    | 내림차순 |
// | tie   | 위 키가 같으면                | id                       | 오름차순 |
//
// **왜 단순 오름차순이 아닌가** — 이 카드는 5개씩 페이지네이션된다. 전체를 예정일 오름차순으로
// 세우면 1페이지가 이미 끝난 과거 결제로 채워지고, 시간이 갈수록 심해진다. 미납을 앞에 두면
// 1페이지가 「앞으로 내야 할 돈」으로 유지된다(사용자 선택).
//
// 🚨 **`due_date` 는 null 이 될 수 있다** — 영수증 OCR 로 `paid_date` 만 채워 만든 건이 그렇다
// (entities/payment/model.ts). 종전처럼 `?? ""` 로 떨어뜨리면 **빈 문자열이 사전식으로 가장 앞**
// 이라 날짜 없는 건이 「가장 임박한 결제」 자리를 차지한다. 명시적으로 뒤로 보낸다.
//
// **`id` tie-break 를 두는 이유** — `toSorted` 는 스펙상 안정 정렬이지만, 그 안정성이 지켜 주는
// 것은 **입력 배열의 순서**다. 그 입력은 `GET /payments` 응답이고 서버는 정렬을 보장하지 않는다
// (CostManagementTab.tsx 머리말). 같은 날 잔금 두 건(예: 예식장·스드메)처럼 키가 겹치는 경우가
// 실제로 흔하므로, 재조회마다 두 행이 자리를 바꾸지 않도록 여기서 순서를 못 박는다.
//
// 날짜는 ISO `YYYY-MM-DD` 라 **사전식 비교가 곧 시간순**이다 — `Date` 파싱을 새로 들이지 않는다
// (`pages/timeline/ui/group-by-phase.ts` 가 같은 근거로 같은 방식을 쓴다).
import type { Payment } from "@/entities/payment";

/** 미납이 앞(0), 끝난 건이 뒤(1). CANCELED 는 「낼 돈」이 아니므로 끝난 쪽이다. */
function group(payment: Payment): number {
  return payment.status === "PLANNED" ? 0 : 1;
}

/**
 * 끝난 건의 정렬 키 — **종전 `sortByRecency` 와 같은 식**이다. 이 그룹 안의 순서는 바뀌지 않는다.
 * 여기서는 `?? ""` 가 안전하다: 내림차순이라 빈 문자열이 뒤로 가고, 그 자리가 "날짜를 알 수 없는
 * 건"에 맞는 자리다.
 */
function settledKey(payment: Payment): string {
  return payment.paid_date ?? payment.due_date ?? "";
}

function compare(a: Payment, b: Payment): number {
  const groupDiff = group(a) - group(b);
  if (groupDiff !== 0) return groupDiff;

  if (group(a) === 0) {
    // 미납 — 예정일 오름차순, 예정일 없는 건은 그룹 맨 뒤.
    if (a.due_date === null || b.due_date === null) {
      if (a.due_date === b.due_date) return a.id.localeCompare(b.id);
      return a.due_date === null ? 1 : -1;
    }
    const byDueDate = a.due_date.localeCompare(b.due_date);
    if (byDueDate !== 0) return byDueDate;
  } else {
    // 끝난 건 — 최근 것이 위로(내림차순).
    const byRecency = settledKey(b).localeCompare(settledKey(a));
    if (byRecency !== 0) return byRecency;
  }

  return a.id.localeCompare(b.id);
}

/** 원본을 변형하지 않는다(`toSorted`) — 호출부가 응답 배열을 그대로 들고 있어도 안전하다. */
export function sortPaymentsByDueDate(payments: readonly Payment[]): Payment[] {
  return payments.toSorted(compare);
}
