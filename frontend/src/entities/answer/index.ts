// answer 도메인 모델 — 브리프코치_DB_설계서_ERD.md의 answer + answer_metric과 대응.
export interface AnswerMetrics {
  fillerWordCount: number;
  wpm: number;
  sentenceCount: number;
  silenceMs: number;
}

export interface Answer {
  id: string;
  sessionId: string;
  questionId: string;
  status: "processing" | "done" | "failed";
  transcriptText: string | null;
  metrics: AnswerMetrics | null;
}
