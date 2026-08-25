// 신고(F13) 도메인 타입 — 03_API_spec.md §7. AI 산출물(상담 답변/체크리스트/타임라인 항목) 신고.
// 관리자 검토(status 전이)는 스코프 밖이라 이 슬라이스는 접수(POST)만 다룬다.

export type FeedbackTargetType = "CHAT_MESSAGE" | "CHECKLIST_ITEM" | "TIMELINE_ITEM";
// "편향/차별적"은 슬래시 포함 표기 그대로 — backend/app/schemas/common.py 원본과 동일.
export type FeedbackReasonCategory = "부정확함" | "부적절함" | "도움안됨" | "편향/차별적" | "기타";
export type FeedbackStatus = "OPEN" | "REVIEWED" | "RESOLVED";

export interface FeedbackReportCreateInput {
  target_type: FeedbackTargetType;
  target_id: string;
  reason_category: FeedbackReasonCategory;
  comment?: string;
}

export interface FeedbackReport {
  id: string;
  status: FeedbackStatus;
  created_at: string;
}
