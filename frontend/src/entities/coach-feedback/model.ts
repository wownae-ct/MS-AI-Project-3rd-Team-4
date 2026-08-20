// coach_feedback 도메인 모델.
// 이 슬라이스에는 api 세그먼트가 없다 — 코칭 결과는 answer의 SSE 스트림으로 전달되며
// 별도 REST 엔드포인트가 없기 때문이다. 계약이 생기면 그때 api/를 추가한다.
export interface StructureScore {
  opening: number;
  star: number;
  conciseness: number;
}

export type GuardrailVerdict = "pass" | "retry" | "degraded";

export interface CoachFeedback {
  answerId: string;
  structureScore: StructureScore;
  feedbackText: string;
  rewriteExample: string | null;
  guardrailVerdict: GuardrailVerdict;
}
