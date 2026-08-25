import { apiFetch, apiFetchMultipart } from "@/shared/api";
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
  return apiFetchMultipart("/api/v1/payments/receipt-extract", form, { signal }) as Promise<ReceiptExtractResult>;
}
