import { apiFetch } from "@/shared/api";
import type { FeedbackReport, FeedbackReportCreateInput } from "../model";

export function createFeedbackReport(input: FeedbackReportCreateInput): Promise<FeedbackReport> {
  return apiFetch("/api/v1/feedback-reports", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<FeedbackReport>;
}
