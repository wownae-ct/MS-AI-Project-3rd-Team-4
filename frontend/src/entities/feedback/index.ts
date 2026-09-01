// feedback 슬라이스 공개 API — 슬라이스 밖에서는 이 파일로만 접근한다.
export type {
  FeedbackReasonCategory,
  FeedbackReport,
  FeedbackReportCreateInput,
  FeedbackStatus,
  FeedbackTargetType,
} from "./model";
export { createFeedbackReport } from "./api/feedback";
export { ReportButton } from "./ui/ReportButton";
