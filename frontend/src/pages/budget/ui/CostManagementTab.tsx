// "비용 관리" 섹션 — 전 카테고리 통합 납부 내역 + 영수증 OCR 입력 (UX 개편, 2026-08-26 신설).
//
// `getPayments()`를 `categoryCode` 없이 부른다 — 이 파라미터가 원래 optional이라(entities/payment/
// api/payment.ts) 전체 카테고리 결제 내역 조회에 백엔드 변경이 필요 없다. 정렬은 서버가 보장하지
// 않으므로 여기서 결제일(없으면 예정일) 내림차순으로 다시 정렬한다 — 최근/임박한 것이 위로.
//
// `AddPaymentRow`(entities/payment/ui)의 `categoryOptions`에 비용을 다루는(has_cost) 카테고리만
// 넘긴다 — MEETING처럼 비용 개념이 없는 카테고리에 결제를 만들 수 없게 호출부가 미리 거른다.
//
// `onPaymentAdded`는 이 섹션 자체의 목록 재조회와는 별개다 — 새 결제가 `paid_date`와 함께
// 등록되면 서버가 그 카테고리의 `paid_amount`를 바꾸므로(status=PAID 자동 유도), 예산 페이지의
// 도넛·배정 목록도 낡은 값을 보지 않으려면 `GET /wedding-categories`를 다시 불러야 한다 —
// 그 재조회는 BudgetPage가 소유한다(이 컴포넌트는 카테고리 데이터를 모른다).
import { useEffect, useState } from "react";
import { AddPaymentRow, PaymentListRow, getPayments, type Payment } from "@/entities/payment";
import { ApiError } from "@/shared/api";
import { Card } from "@/shared/ui";

export interface CostManagementTabProps {
  categoryLabelByCode: ReadonlyMap<string, string>;
  categoryOptions: readonly { code: string; name_ko: string }[];
  onPaymentAdded: () => void;
}

function sortByRecency(payments: readonly Payment[]): Payment[] {
  return payments.toSorted((a, b) => (b.paid_date ?? b.due_date ?? "").localeCompare(a.paid_date ?? a.due_date ?? ""));
}

export function CostManagementTab({ categoryLabelByCode, categoryOptions, onPaymentAdded }: CostManagementTabProps) {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refetchPayments() {
    getPayments()
      .then((res) => {
        setPayments(sortByRecency(res.payments));
        // 이전 실패로 뜬 에러가 있었다면 지운다 — CostTab.tsx의 같은 관례(레드팀 감사 교차 패턴 02).
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "납부 내역을 불러오지 못했습니다.");
      });
  }

  useEffect(() => {
    let cancelled = false;
    getPayments()
      .then((res) => {
        if (cancelled) return;
        setPayments(sortByRecency(res.payments));
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "납부 내역을 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleAdded() {
    refetchPayments();
    onPaymentAdded();
  }

  return (
    <Card title="비용 관리">
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
          {error}
        </p>
      )}
      {payments === null ? (
        <p className="text-sm text-ink-soft">불러오는 중…</p>
      ) : payments.length === 0 ? (
        <p className="text-sm text-ink-soft">등록된 납부 내역이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {payments.map((p) => (
            <PaymentListRow key={p.id} payment={p} categoryLabel={categoryLabelByCode.get(p.category_code) ?? p.category_code} />
          ))}
        </ul>
      )}
      <AddPaymentRow categoryOptions={categoryOptions} onAdded={handleAdded} />
    </Card>
  );
}
