// question 도메인 모델 — 브리프코치_DB_설계서_ERD.md의 question과 대응.
export type QuestionCategory = "tech_interview" | "customer_explain" | "incident_report";

export interface Question {
  id: string;
  category: QuestionCategory;
  promptText: string;
  timeLimitSec: number;
}
