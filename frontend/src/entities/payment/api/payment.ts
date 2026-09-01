// 결제 내역(#15-20, #34) REST 클라이언트 — 목록 · 생성 · 수정 · 삭제 · 다가오는 결제 ·
// 시세 비교, 그리고 영수증 사진 추출.
//
// 영수증 추출은 서버에 아무것도 저장하지 않는다. 사진에서 읽어낸 값을 돌려주기만 하고,
// 사용자가 폼에서 확인·수정한 뒤 별도로 생성 요청을 보내는 흐름이다(카테고리는 자동으로
// 추론하지 않는다 — 틀리면 사용자가 알아채기 어려운 값이라서다).
import { apiFetch, apiFetchMultipart, RECEIPT_OCR_TIMEOUT_MS } from "@/shared/api";
import type {
  BenchmarkComparison,
  Payment,
  PaymentCreateInput,
  PaymentPatchInput,
  PaymentsResponse,
  PaymentStatus,
  ReceiptExtractResult,
  UpcomingPaymentsResponse,
} from "../model";

export function getPayments(params?: { categoryCode?: string; status?: PaymentStatus }): Promise<PaymentsResponse> {
  const query = new URLSearchParams();
  if (params?.categoryCode) query.set("category_code", params.categoryCode);
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  return apiFetch(`/api/v1/payments${qs ? `?${qs}` : ""}`) as Promise<PaymentsResponse>;
}

export function createPayment(input: PaymentCreateInput): Promise<Payment> {
  return apiFetch("/api/v1/payments", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<Payment>;
}

export function patchPayment(paymentId: string, input: PaymentPatchInput): Promise<Payment> {
  return apiFetch(`/api/v1/payments/${paymentId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }) as Promise<Payment>;
}

export function deletePayment(paymentId: string): Promise<void> {
  return apiFetch(`/api/v1/payments/${paymentId}`, { method: "DELETE" }) as Promise<void>;
}

export function getUpcomingPayments(days = 30): Promise<UpcomingPaymentsResponse> {
  return apiFetch(`/api/v1/payments/upcoming?days=${days}`) as Promise<UpcomingPaymentsResponse>;
}

export function getBenchmarkCompare(params: {
  categoryCode: string;
  itemCode: string;
  amount: number;
}): Promise<BenchmarkComparison> {
  const query = new URLSearchParams({
    category_code: params.categoryCode,
    item_code: params.itemCode,
    amount: String(params.amount),
  });
  return apiFetch(`/api/v1/benchmarks/compare?${query.toString()}`) as Promise<BenchmarkComparison>;
}

// #34 — 영수증 사진에서 item_name/vendor_name/amount/paid_date 자동채움(S3 비용 탭). DB 반영
// 없음(추출만); FormData 는 apiFetch 의 JSON 래퍼를 태우면 Content-Type boundary 가 깨진다
// (shared/api/client.ts 머리말) — apiFetchMultipart 를 직접 쓴다.
export function getReceiptExtract(file: File, signal?: AbortSignal): Promise<ReceiptExtractResult> {
  const form = new FormData();
  form.set("file", file);
  return apiFetchMultipart(
    "/api/v1/payments/receipt-extract",
    form,
    { signal },
    RECEIPT_OCR_TIMEOUT_MS,
  ) as Promise<ReceiptExtractResult>;
}
