// question 요청 함수. FSD 공식 api 세그먼트 정의: "backend interactions: request functions, data types, mappers".
//
// 응답 타입은 unknown을 유지한다 — 백엔드 계약이 확정되기 전에 지어내지 않는다.
// 계약이 정해지면 좁히는 지점이 여기다(호출부가 아니라).
import { http } from "@/shared/api";
import type { QuestionCategory } from "../model";

export function listQuestions(category?: QuestionCategory) {
  const query = category ? `?category=${category}` : "";
  return http.get<unknown>(`/api/v1/questions${query}`);
}
