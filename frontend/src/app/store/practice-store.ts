// 전역 연습 세션 스토어 (Zustand) — 답변 녹음 생명주기 + 현재 질문/세션 식별자.
// 이전 프로젝트의 고빈도 transient 레이어(포즈 프레임)는 이 도메인에 없다 — 녹음 상태는 저빈도 이벤트.
import { createStore } from "zustand/vanilla";
import type { QuestionCategory } from "../../entities/question";
import type { RecordingState } from "../../entities/practice-session";

export interface PracticeSummary {
  sessionId: string | null;
  category: QuestionCategory | null;
  questionId: string | null;
  recordingState: RecordingState;
  answerId: string | null;
}

export interface PracticeStore extends PracticeSummary {
  setSession(sessionId: string): void;
  selectQuestion(category: QuestionCategory, questionId: string): void;
  setRecordingState(state: RecordingState): void;
  setAnswerId(answerId: string): void;
  reset(): void;
}

const INITIAL: PracticeSummary = {
  sessionId: null,
  category: null,
  questionId: null,
  recordingState: "idle",
  answerId: null,
};

export const practiceStore = createStore<PracticeStore>()((set) => ({
  ...INITIAL,
  setSession: (sessionId) => set({ sessionId }),
  selectQuestion: (category, questionId) => set({ category, questionId }),
  setRecordingState: (recordingState) => set({ recordingState }),
  setAnswerId: (answerId) => set({ answerId }),
  reset: () => set({ ...INITIAL }),
}));
