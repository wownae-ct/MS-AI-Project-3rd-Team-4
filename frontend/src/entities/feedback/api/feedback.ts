// 신고(#30) REST 클라이언트 — AI 답변이나 개인화 항목이 부정확할 때 사용자가 알린다.
// 접수만 하고 이후 상태 전이(관리자 검토)는 이 프로젝트 범위 밖이다.
import { apiFetch } from "@/shared/api";
import type { FeedbackReport, FeedbackReportCreateInput } from "../model";

export function createFeedbackReport(input: FeedbackReportCreateInput): Promise<FeedbackReport> {
  return apiFetch("/api/v1/feedback-reports", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<FeedbackReport>;
}
