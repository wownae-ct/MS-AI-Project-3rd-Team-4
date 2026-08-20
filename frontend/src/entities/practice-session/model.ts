// practice_session 도메인 모델. 타입 위치 근거는 question/model.ts 주석 참조(순환 방지).
export interface PracticeSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: "in_progress" | "completed";
}

/** 답변 녹음 생명주기 — app/store와 pages가 공유한다(FSD 하향 규칙). */
export type RecordingState = "idle" | "recording" | "uploading" | "processing" | "done" | "error";
