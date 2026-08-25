// "+ 납부 항목 추가" — 목업(s3-category-detail.html:341)엔 버튼만 있고 클릭 이후 폼은 그려져
// 있지 않다(정적 프로토타입이라 상호작용까지는 스펙 대상이 아니었다). 클릭 시 펼쳐지는 최소
// 인라인 폼은 이 저장소의 기존 관례(모달 없이 인라인으로 상태 전환하는 패턴)를 따라 새로
// 설계했다. `CostTab.tsx`에서 분리한 이유는 파일 크기 게이트(`eslint/max-lines`, 300줄) 때문 —
// 로직 자체는 CostTab 전용이라 별도 슬라이스로 승격하지 않고 같은 `ui/` 폴더에 둔다.
import { useState } from "react";
import { createPayment, type PaymentType } from "@/entities/payment";
import { ApiError } from "@/shared/api";

const ADD_BTN =
  "mt-3 w-full rounded-sm border border-dashed border-line bg-transparent py-2.5 text-sm font-bold text-ink-soft";
const FORM_INPUT = "min-h-tap w-full rounded-md border border-line bg-surface px-2.5 text-sm text-ink";

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  DEPOSIT: "계약금",
  INTERIM: "중도금",
  BALANCE: "잔금",
  ETC: "기타",
};

export function AddPaymentRow({ categoryCode, onAdded }: { categoryCode: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [itemName, setItemName] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("DEPOSIT");
  const [vendorName, setVendorName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setItemName("");
    setPaymentType("DEPOSIT");
    setVendorName("");
    setAmount("");
    setDueDate("");
    setError(null);
  }

  async function handleSubmit() {
    const parsedAmount = Number(amount);
    if (!itemName || !vendorName || !dueDate || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("모든 항목을 올바르게 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPayment({
        category_code: categoryCode,
        item_name: itemName,
        payment_type: paymentType,
        vendor_name: vendorName,
        amount: parsedAmount,
        due_date: dueDate,
      });
      reset();
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "납부 항목을 추가하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className={ADD_BTN} onClick={() => setOpen(true)}>
        + 납부 항목 추가
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border border-line bg-bg p-3">
      <input className={FORM_INPUT} placeholder="항목명" value={itemName} onChange={(e) => setItemName(e.target.value)} />
      <select
        className={FORM_INPUT}
        value={paymentType}
        onChange={(e) => setPaymentType(e.target.value as PaymentType)}
      >
        {Object.entries(PAYMENT_TYPE_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input className={FORM_INPUT} placeholder="업체명" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
      <input
        className={FORM_INPUT}
        type="number"
        min={0}
        placeholder="금액(원)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <input className={FORM_INPUT} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      {error && (
        <p role="alert" className="text-xs text-primary">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="min-h-tap flex-1 rounded-md bg-primary text-sm font-bold text-surface disabled:opacity-50"
        >
          {saving ? "저장 중…" : "추가"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="min-h-tap flex-1 rounded-md border border-line bg-surface text-sm font-bold text-ink-soft"
        >
          취소
        </button>
      </div>
    </div>
  );
}
