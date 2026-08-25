// 결제/시세비교 도메인 타입 — 03_API_spec.md ④ 섹션(#18-#23, #34).
// contact_name/contact_phone/receipt_url 은 [프로토타입 반영] 필드 — 파일 업로드 대신 URL 입력.

// backend/app/schemas/common.py:52 원본 — FULL 은 실존하지 않는다(422 유발). ETC 가 맞다.
export type PaymentType = "DEPOSIT" | "INTERIM" | "BALANCE" | "ETC";
// backend/app/schemas/common.py:53 원본 — CANCELED 포함 3값 Literal(Pydantic 검증 대상).
// "자유 문자열" 이 아니다 — status 유무로 서버가 PAID/PLANNED 를 자동 유도하는 로직
// (app/services/payment.py::create_payment())이 이 값에 의존한다.
export type PaymentStatus = "PLANNED" | "PAID" | "CANCELED";

export interface Payment {
  id: string;
  category_code: string;
  item_name: string;
  payment_type: PaymentType;
  vendor_name: string;
  contact_name: string | null;
  contact_phone: string | null;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: PaymentStatus;
  receipt_url: string | null;
  memo: string | null;
}

export interface PaymentsResponse {
  payments: Payment[];
}

export interface PaymentCreateInput {
  category_code: string;
  item_name: string;
  payment_type: PaymentType;
  vendor_name: string;
  contact_name?: string;
  contact_phone?: string;
  amount: number;
  due_date: string;
  // 영수증 OCR 자동채움(#34) 전용 — 이미 결제 완료된 건을 등록할 때 씀. paid_date 가 있으면
  // status 를 클라이언트가 직접 안 보내도 서버가 PAID 로 자동 유도한다(backend/app/schemas/
  // payment.py:47-52) — status 자체는 이 입력에 없다(임의 상태 생성 방지).
  paid_date?: string;
  receipt_url?: string;
}

export interface PaymentPatchInput {
  status?: PaymentStatus;
  paid_date?: string;
  receipt_url?: string;
  memo?: string;
}

export interface UpcomingPaymentEntry {
  id: string;
  category_code: string;
  item_name: string;
  amount: number;
  due_date: string;
  d_day: number;
}

export interface UpcomingPaymentsResponse {
  days: number;
  payments: UpcomingPaymentEntry[];
}

export interface BenchmarkComparison {
  category_code: string;
  item_code: string;
  region_code: string;
  survey_month: string;
  your_amount: number;
  median_price: number;
  // null 가능 — 표본이 부족한 지역/항목은 최소·최대를 못 낸다(backend/app/schemas/benchmark.py:
  // 25-26). 다른 세션의 재감사로 발견(2026-08-24) — 이전엔 여기가 필수 number라 범위 막대가
  // null - number 산술로 조용히 틀린 값을 그릴 위험이 있었다.
  min_price: number | null;
  max_price: number | null;
  sample_count: number;
  percentile_label: string;
  ratio_to_median: number;
  source_url: string;
  source_note: string | null;
}

/**
 * `POST /payments/receipt-extract`(#34) 응답 — backend/app/schemas/payment.py::ReceiptExtractOut.
 * DB 반영 없음(추출만) — 화면은 이 값으로 결제 등록 폼을 프리필하고, 사용자 확인/수정 후
 * `createPayment`(#19)를 호출한다. `category_code`는 포함하지 않는다(상호명만으로 카테고리를
 * 신뢰할 수 없어 사용자가 직접 선택). 읽지 못했거나 확신할 수 없는 필드는 null —
 * `receipt_url`만 항상 값이 있다(업로드는 추출 성공 여부와 무관하게 항상 먼저 끝남).
 */
export interface ReceiptExtractResult {
  item_name: string | null;
  vendor_name: string | null;
  amount: number | null;
  paid_date: string | null;
  receipt_url: string;
}
