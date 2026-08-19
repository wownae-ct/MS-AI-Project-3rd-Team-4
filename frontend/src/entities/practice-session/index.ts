// practice_session 도메인 모델 — 브리프코치_DB_설계서_ERD.md의 practice_session과 대응.
// 슬라이스 밖에서는 이 public API로만 import.
export interface PracticeSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: "in_progress" | "completed";
}

/** 답변 녹음 생명주기 — app/store와 pages가 공유하는 하위 레이어 타입(FSD 하향 규칙) */
export type RecordingState = "idle" | "recording" | "uploading" | "processing" | "done" | "error";
