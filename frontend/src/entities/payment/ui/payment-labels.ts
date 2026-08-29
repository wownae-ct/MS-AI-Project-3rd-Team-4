// 결제 종류 한글 라벨 — CostTab.tsx와 AddPaymentRow.tsx 두 곳에 같은 리터럴이 복제돼 있던 것을
// 한 곳으로 모았다(UX 개편 Phase 1, 2026-08-26). model.ts는 타입만 담는 관례라 여기 별도 파일에 둔다.
import type { PaymentType } from "../model";

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  DEPOSIT: "계약금",
  INTERIM: "중도금",
  BALANCE: "잔금",
  ETC: "기타",
};

// 결제 유형 배지 색 — D13(2026-08-27)으로 도입, D17(2026-08-29, 사용자 지시)로 체계를 다시 잡았다.
//
// 계약금 → 중도금 → 잔금은 **순서가 있는 축**이다(기타만 그 축 밖). D13 은 여기에 서로 다른
// 색상 4종을 입혀 그 순서를 못 실었다. 이제 색상은 하나(블루)로 통일하고 **명도 3단계**가
// 순서를 나른다 — theme.css 의 `--color-payment-*` 가 그 값이다.
//
// **배경 클래스가 없는 것이 정상이다.** 이 배지는 `Badge` 의 `outline` 변이로 그린다 —
// 배경은 `surface`, 보더는 `border-current` 라 글자 색을 따라온다. 그래서 여기서는 `text-*`
// 하나만 정한다. 채움(카테고리 배지)과 테두리(이 배지)라는 **형태 차이가 두 계열을 구분**한다
// (같은 줄에 배지 2개가 붙는 `PaymentListRow` 참고).
//
// 완성된 클래스 문자열을 그대로 둔다(조립 금지 — Tailwind 스캐너는 소스를 평문으로 읽는다).
export const PAYMENT_TYPE_BADGE_CLASS: Record<PaymentType, string> = {
  DEPOSIT: "text-payment-deposit",
  INTERIM: "text-payment-interim",
  BALANCE: "text-payment-balance",
  ETC: "text-payment-etc",
};
