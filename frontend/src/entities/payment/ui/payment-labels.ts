// 결제 종류 한글 라벨 — CostTab.tsx와 AddPaymentRow.tsx 두 곳에 같은 리터럴이 복제돼 있던 것을
// 한 곳으로 모았다(UX 개편 Phase 1, 2026-08-26). model.ts는 타입만 담는 관례라 여기 별도 파일에 둔다.
import type { PaymentType } from "../model";

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  DEPOSIT: "계약금",
  INTERIM: "중도금",
  BALANCE: "잔금",
  ETC: "기타",
};
