// "+ 납부 항목 추가" — 목업(s3-category-detail.html:341)엔 버튼만 있고 클릭 이후 폼은 그려져
// 있지 않다(정적 프로토타입이라 상호작용까지는 스펙 대상이 아니었다). 클릭 시 펼쳐지는 최소
// 인라인 폼은 이 저장소의 기존 관례(모달 없이 인라인으로 상태 전환하는 패턴)를 따라 새로
// 설계했다.
//
// **entities/payment/ui로 승격됨(UX 개편 Phase 1, 2026-08-26)** — 원래 `pages/category/ui`에
// 있었으나(파일 크기 게이트 회피 목적), 예산 페이지의 새 "비용 관리" 섹션도 이 폼이 필요해졌고
// `pages/budget`은 `pages/category`를 import할 수 없다(.oxlintrc.json FSD 경계) — entities가
// 유일한 공유 지점이다.
//
// **영수증 사진 OCR 자동채움(2026-08-26 사용자 지시)** — `getReceiptExtract()`(#34
// POST /payments/receipt-extract)로 사진을 올리면 항목명/업체명/금액/결제일을 채워준다.
// `capture="environment"` 는 모바일에서 파일 선택 대신 후면 카메라를 바로 연다(지원 브라우저
// 한정 — 데스크톱은 그냥 파일 선택창으로 열린다). DB 반영은 없는 추출 전용 호출이라, 결과는
// 그대로 폼에 채워질 뿐 사용자가 확인/수정한 뒤 "추가"를 눌러야 실제로 저장된다(백엔드 결정
// 문서와 동일 원칙). OCR이 못 읽은 필드(null)는 기존 입력값을 지우지 않는다 — 사용자가 이미
// 손으로 채워둔 값을 빈 결과로 덮어쓰면 오히려 손해다.
import { useRef, useState } from "react";
import { ApiError } from "@/shared/api";
import { AMOUNT_STEP_WON } from "@/shared/lib/money";
import { NumberInput } from "@/shared/ui";
import { createPayment, getReceiptExtract } from "../api/payment";
import type { PaymentType } from "../model";
import { PAYMENT_TYPE_LABEL } from "./payment-labels";

const ADD_BTN =
  "mt-3 w-full rounded-sm border border-dashed border-line bg-transparent py-2.5 text-sm font-bold text-ink-soft";
const FORM_INPUT = "min-h-tap w-full rounded-md border border-line bg-surface px-2.5 text-base text-ink";
const RECEIPT_BTN =
  "min-h-tap w-full cursor-pointer rounded-md border border-dashed border-primary bg-primary-soft " +
  "text-center text-sm font-bold text-primary disabled:cursor-not-allowed disabled:opacity-50";
const FIELD_NOTE = "text-xs text-ink-soft";

// 백엔드 허용치와 동일하게 맞춘다(backend/app/routers/budget.py:56-58) — 서버 왕복 없이
// 바로 알려주는 편이 사용자 경험이 낫다. 서버 쪽 검증은 그대로 최종 방어선으로 남는다.
const ALLOWED_RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

export interface AddPaymentRowProps {
  /** 카테고리가 이미 고정된 화면(S3 비용 탭)이 넘긴다 — categoryOptions와 동시에 줄 수 없다. */
  categoryCode?: string;
  /** 넘기면 카테고리 선택 드롭다운을 렌더한다(예산 페이지의 전 카테고리 통합 "비용 관리").
      비용을 다루지 않는 카테고리(has_cost=false)는 호출부가 미리 걸러서 넘겨야 한다. */
  categoryOptions?: readonly { code: string; name_ko: string }[];
  onAdded: () => void;
}

export function AddPaymentRow({ categoryCode, categoryOptions, onAdded }: AddPaymentRowProps) {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(() => categoryCode ?? categoryOptions?.[0]?.code ?? "");
  const [itemName, setItemName] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("DEPOSIT");
  const [vendorName, setVendorName] = useState("");
  // 문자열이 아니라 `number | null` 이다 — 금액 칸이 `NumberInput` 으로 바뀌면서 "빈 칸"의
  // 표현이 `""` 에서 `null` 로 옮겨갔다. 0 과 빈 칸은 여전히 구분된다(0원 항목은 아래 검증이 막는다).
  const [amount, setAmount] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 진행 중인 OCR 요청을 취소하기 위한 컨트롤러 — 이전엔 취소 수단이 없어, "취소"로 폼을 닫아도
  // 요청은 계속 진행되다가 나중에 도착한 결과가 이미 닫은(리셋된) 폼 상태를 조용히 채웠다
  // (레드팀 감사).
  const receiptAbortRef = useRef<AbortController | null>(null);

  function reset() {
    setSelectedCategory(categoryCode ?? categoryOptions?.[0]?.code ?? "");
    setItemName("");
    setPaymentType("DEPOSIT");
    setVendorName("");
    setAmount(null);
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
    const abortController = new AbortController();
    receiptAbortRef.current = abortController;
    try {
      const result = await getReceiptExtract(file, abortController.signal);
      if (result.item_name !== null) setItemName(result.item_name);
      if (result.vendor_name !== null) setVendorName(result.vendor_name);
      if (result.amount !== null) setAmount(result.amount);
      if (result.paid_date !== null) setPaidDate(result.paid_date);
      setReceiptUrl(result.receipt_url);
    } catch (err) {
      if (abortController.signal.aborted) return;
      setError(err instanceof ApiError ? err.message : "영수증을 읽지 못했습니다. 직접 입력해 주세요.");
    } finally {
      if (!abortController.signal.aborted) setIsExtracting(false);
    }
  }

  async function handleSubmit() {
    // 빈 칸(null)은 0으로 떨어뜨려 아래 `<= 0` 검증이 그대로 잡게 둔다 — 검증 문구를
    // "금액을 입력해 주세요"로 따로 갈래를 내지 않는다(다른 필드와 같은 한 줄 안내를 쓴다).
    const parsedAmount = amount ?? 0;
    // due_date는 무조건 필수가 아니다 — backend PaymentCreate.due_date도 optional이고, 영수증
    // OCR로 결제일(paidDate)이 이미 채워진 건은 "언제까지 낼지"가 더 이상 의미가 없을 수 있다.
    if (
      !selectedCategory ||
      !itemName ||
      !vendorName ||
      (!dueDate && !paidDate) ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    ) {
      setError("모든 항목을 올바르게 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPayment({
        category_code: selectedCategory,
        item_name: itemName,
        payment_type: paymentType,
        vendor_name: vendorName,
        amount: parsedAmount,
        due_date: dueDate === "" ? undefined : dueDate,
        paid_date: paidDate === "" ? undefined : paidDate,
        receipt_url: receiptUrl ?? undefined,
      });
      // 폼이 바로 닫혀 성공 메시지를 보여줄 자리가 없다 — 스크린리더 사용자는 실패(아래
      // role="alert")만 안내받고 성공은 알 방법이 없었다(접근성 감사 2026-08-26). 폼 바깥에
      // 항상 떠 있는 sr-only 영역에 잠깐 담아 announce한다.
      setSuccessMessage(`"${itemName}" 납부 항목을 추가했어요.`);
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
      <>
        {/* 폼이 닫혀도 방금 추가 성공 announce는 살아있어야 한다. */}
        <output className="sr-only">{successMessage}</output>
        <button
          type="button"
          className={ADD_BTN}
          onClick={() => {
            setSuccessMessage(null);
            setOpen(true);
          }}
        >
          + 납부 항목 추가
        </button>
      </>
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
      {/* categoryOptions가 있을 때만 렌더 — 카테고리가 이미 고정된 S3 비용 탭은 이 select 자체가
          없다(마크업이 바이트 단위로 그대로 유지된다). 카테고리는 영수증 OCR도 추론하지 않는다
          (ReceiptExtractResult에 category_code가 아예 없다) — 항상 사용자가 직접 고른다. */}
      {categoryOptions !== undefined && (
        <select
          className={FORM_INPUT}
          aria-label="카테고리"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          {categoryOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name_ko}
            </option>
          ))}
        </select>
      )}
      <input
        className={FORM_INPUT}
        aria-label="항목명"
        placeholder="항목명"
        value={itemName}
        onChange={(e) => setItemName(e.target.value)}
      />
      <select
        className={FORM_INPUT}
        aria-label="결제 유형"
        value={paymentType}
        onChange={(e) => setPaymentType(e.target.value as PaymentType)}
      >
        {Object.entries(PAYMENT_TYPE_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input
        className={FORM_INPUT}
        aria-label="업체명"
        placeholder="업체명"
        value={vendorName}
        onChange={(e) => setVendorName(e.target.value)}
      />
      <NumberInput
        className={FORM_INPUT}
        step={AMOUNT_STEP_WON}
        min={0}
        aria-label="금액(원)"
        placeholder="금액(원)"
        value={amount}
        onValueChange={setAmount}
      />
      <label className="flex flex-col gap-1">
        <span className={FIELD_NOTE}>납부 예정일{paidDate !== "" && "(선택 — 이미 결제했다면 비워둬도 돼요)"}</span>
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
            // STEP 1-D — 컨트롤러를 만들어 두기만 하고 실제로 abort()를 부르지 않아, "취소"를
            // 눌러도 요청은 백그라운드에서 계속 진행되다가 나중에 도착한 결과가 그 사이 새로
            // 연 다른 폼 상태를 조용히 채우는 버그가 있었다.
            receiptAbortRef.current?.abort();
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
