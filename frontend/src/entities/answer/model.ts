// answer 도메인 모델. 타입을 index.ts가 아니라 여기 두는 이유는 question/model.ts 주석 참조(순환 방지).
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
