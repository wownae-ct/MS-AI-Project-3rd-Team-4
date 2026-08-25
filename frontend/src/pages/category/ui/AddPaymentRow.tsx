// "+ 납부 항목 추가" — 목업(s3-category-detail.html:341)엔 버튼만 있고 클릭 이후 폼은 그려져
// 있지 않다(정적 프로토타입이라 상호작용까지는 스펙 대상이 아니었다). 클릭 시 펼쳐지는 최소
// 인라인 폼은 이 저장소의 기존 관례(모달 없이 인라인으로 상태 전환하는 패턴)를 따라 새로
// 설계했다. `CostTab.tsx`에서 분리한 이유는 파일 크기 게이트(`eslint/max-lines`, 300줄) 때문 —
// 로직 자체는 CostTab 전용이라 별도 슬라이스로 승격하지 않고 같은 `ui/` 폴더에 둔다.
//
// **영수증 사진 OCR 자동채움(2026-08-26 사용자 지시)** — `getReceiptExtract()`(#34
// POST /payments/receipt-extract)로 사진을 올리면 항목명/업체명/금액/결제일을 채워준다.
// `capture="environment"` 는 모바일에서 파일 선택 대신 후면 카메라를 바로 연다(지원 브라우저
// 한정 — 데스크톱은 그냥 파일 선택창으로 열린다). DB 반영은 없는 추출 전용 호출이라, 결과는
// 그대로 폼에 채워질 뿐 사용자가 확인/수정한 뒤 "추가"를 눌러야 실제로 저장된다(백엔드 결정
// 문서와 동일 원칙). OCR이 못 읽은 필드(null)는 기존 입력값을 지우지 않는다 — 사용자가 이미
// 손으로 채워둔 값을 빈 결과로 덮어쓰면 오히려 손해다.
import { useRef, useState } from "react";
import { createPayment, getReceiptExtract, type PaymentType } from "@/entities/payment";
import { ApiError } from "@/shared/api";

const ADD_BTN =
  "mt-3 w-full rounded-sm border border-dashed border-line bg-transparent py-2.5 text-sm font-bold text-ink-soft";
const FORM_INPUT = "min-h-tap w-full rounded-md border border-line bg-surface px-2.5 text-sm text-ink";
const RECEIPT_BTN =
  "min-h-tap w-full cursor-pointer rounded-md border border-dashed border-primary bg-primary-soft " +
  "text-center text-sm font-bold text-primary disabled:cursor-not-allowed disabled:opacity-50";
const FIELD_NOTE = "text-xs text-ink-soft";

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  DEPOSIT: "계약금",
  INTERIM: "중도금",
  BALANCE: "잔금",
  ETC: "기타",
};

// 백엔드 허용치와 동일하게 맞춘다(backend/app/routers/budget.py:56-58) — 서버 왕복 없이
// 바로 알려주는 편이 사용자 경험이 낫다. 서버 쪽 검증은 그대로 최종 방어선으로 남는다.
const ALLOWED_RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

export function AddPaymentRow({ categoryCode, onAdded }: { categoryCode: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [itemName, setItemName] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("DEPOSIT");
  const [vendorName, setVendorName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setItemName("");
    setPaymentType("DEPOSIT");
    setVendorName("");
    setAmount("");
    setDueDate("");
    setPaidDate("");
    setReceiptUrl(null);
    setError(null);
  }

  async function handleReceiptChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // 같은 파일을 다시 골라도 change가 또 뜨게(브라우저는 값이 그대로면 이벤트를 안 낸다).
    if (!file) return;

    if (!ALLOWED_RECEIPT_TYPES.includes(file.type)) {
      setError(`지원하지 않는 이미지 형식입니다: ${file.type || "알 수 없음"}`);
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setError("영수증 이미지가 너무 큽니다(최대 15MB).");
      return;
    }

    setIsExtracting(true);
    setError(null);
    try {
      const result = await getReceiptExtract(file);
      if (result.item_name !== null) setItemName(result.item_name);
      if (result.vendor_name !== null) setVendorName(result.vendor_name);
      if (result.amount !== null) setAmount(String(result.amount));
      if (result.paid_date !== null) setPaidDate(result.paid_date);
      setReceiptUrl(result.receipt_url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "영수증을 읽지 못했습니다. 직접 입력해 주세요.");
    } finally {
      setIsExtracting(false);
    }
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
        paid_date: paidDate === "" ? undefined : paidDate,
        receipt_url: receiptUrl ?? undefined,
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
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_RECEIPT_TYPES.join(",")}
        capture="environment"
        className="sr-only"
        onChange={(event) => void handleReceiptChange(event)}
      />
      <button
        type="button"
        className={RECEIPT_BTN}
        disabled={isExtracting}
        onClick={() => fileInputRef.current?.click()}
      >
        {isExtracting ? "영수증 분석 중…" : "📷 영수증으로 채우기"}
      </button>
      {receiptUrl !== null && !isExtracting && <p className={FIELD_NOTE}>영수증에서 읽은 값이에요 — 확인하고 필요하면 고쳐주세요.</p>}
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
      <label className="flex flex-col gap-1">
        <span className={FIELD_NOTE}>납부 예정일</span>
        <input className={FORM_INPUT} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={FIELD_NOTE}>결제일(이미 냈으면, 선택)</span>
        <input className={FORM_INPUT} type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
      </label>
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
