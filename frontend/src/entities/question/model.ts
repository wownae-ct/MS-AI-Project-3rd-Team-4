// question 도메인 모델.
// 타입을 여기 두는 이유 — index.ts(공개 API)에 두면 api/ 세그먼트가 타입을 쓰려고
// index.ts를 import하게 되어 index → api → index 순환이 생긴다(import/no-cycle 위반).
export type QuestionCategory = "tech_interview" | "customer_explain" | "incident_report";

export interface Question {
  id: string;
  category: QuestionCategory;
  promptText: string;
  timeLimitSec: number;
}
