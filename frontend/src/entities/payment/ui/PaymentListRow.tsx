// 납부 내역 한 줄 — CostTab.tsx(카테고리별 비용 탭)에서 뽑아냈다(UX 개편 Phase 1, 2026-08-26) —
// 예산 페이지의 새 "비용 관리" 섹션(전 카테고리 통합 목록)이 같은 렌더를 재사용해야 하는데
// `pages/budget`은 `pages/category`를 import할 수 없다(.oxlintrc.json 「pages는 다른 pages
// 슬라이스를 못 넘본다」) — entities로 승격해야 양쪽이 쓸 수 있다.
//
// `categoryLabel`은 옵션이다 — S3 카테고리 상세(CostTab)는 이미 카테고리 화면 안이라 안 넘기고,
// 예산 페이지의 전 카테고리 통합 목록만 넘긴다. 안 넘기면 이 컴포넌트의 렌더는 CostTab의
// 기존 마크업과 바이트 단위로 동일하다.
import { Badge, Money } from "@/shared/ui";
import type { Payment } from "../model";
import { PAYMENT_TYPE_LABEL } from "./payment-labels";

export interface PaymentListRowProps {
  payment: Payment;
  categoryLabel?: string;
}

export function PaymentListRow({ payment: p, categoryLabel }: PaymentListRowProps) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <Badge>{PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type}</Badge>
          {categoryLabel !== undefined && <Badge>{categoryLabel}</Badge>}
          <p className="truncate text-sm font-bold text-ink">{p.item_name}</p>
        </div>
        <p className="text-xs text-ink-soft">
          {p.vendor_name ?? "업체명 미상"} ·{" "}
          {/* status는 PLANNED/PAID 2갈래만 아니라 CANCELED도 있다(backend/app/schemas/
              common.py:53) — 이걸 놓치면 취소된 결제가 "예정일..."로 잘못 보인다
              (레드팀 감사 라운드 2). 지금은 CANCELED로 바꾸는 UI가 없어 잠재적이지만,
              서버가 이미 이 값을 낼 수 있는 이상 렌더 쪽은 3갈래를 그대로 반영한다. */}
          {p.status === "PAID"
            ? `지급완료 ${p.paid_date ?? ""}`
            : p.status === "CANCELED"
              ? "취소됨"
              : `예정일 ${p.due_date ?? "미정"}`}
        </p>
      </div>
      <Money value={p.amount} className="shrink-0" />
    </li>
  );
}
