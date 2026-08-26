// 결제 종류 한글 라벨 — CostTab.tsx와 AddPaymentRow.tsx 두 곳에 같은 리터럴이 복제돼 있던 것을
// 한 곳으로 모았다(UX 개편 Phase 1, 2026-08-26). model.ts는 타입만 담는 관례라 여기 별도 파일에 둔다.
import type { PaymentType } from "../model";

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  DEPOSIT: "계약금",
  INTERIM: "중도금",
  BALANCE: "잔금",
  ETC: "기타",
};

// 결제 유형 배지 색 — D13(docs/design/decisions.md), 2026-08-27, 사용자 지시. 완성된 클래스
// 문자열을 그대로 둔다(조립 금지 — CLAUDE.md §5.1, Tailwind 스캐너는 소스를 평문으로 읽는다).
export const PAYMENT_TYPE_BADGE_CLASS: Record<PaymentType, string> = {
  DEPOSIT: "bg-payment-deposit-soft text-payment-deposit",
  INTERIM: "bg-payment-interim-soft text-payment-interim",
  BALANCE: "bg-payment-balance-soft text-payment-balance",
  ETC: "bg-payment-etc-soft text-payment-etc",
};
