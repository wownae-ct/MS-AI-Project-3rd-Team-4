// coach_feedback 도메인 모델 — 브리프코치_DB_설계서_ERD.md의 coach_feedback + guardrail_check와 대응.
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
