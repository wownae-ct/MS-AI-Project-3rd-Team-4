// backend/app/gateway/routers/questions.py 대응
import { http } from "./client";

export type QuestionCategory = "tech_interview" | "customer_explain" | "incident_report";

export function listQuestions(category?: QuestionCategory) {
  const query = category ? `?category=${category}` : "";
  return http.get<unknown>(`/api/v1/questions${query}`);
}
