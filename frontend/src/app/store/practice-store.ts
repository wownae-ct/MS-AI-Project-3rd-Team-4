// 전역 연습 세션 스토어 (Zustand) — 답변 녹음 생명주기 + 현재 질문/세션 식별자.
// 이전 프로젝트의 고빈도 transient 레이어(포즈 프레임)는 이 도메인에 없다 — 녹음 상태는 저빈도 이벤트.
import { createStore } from "zustand/vanilla";
import type { QuestionCategory } from "@/entities/question";
import type { RecordingState } from "@/entities/practice-session";

export interface PracticeSummary {
  sessionId: string | null;
  category: QuestionCategory | null;
  questionId: string | null;
  recordingState: RecordingState;
  answerId: string | null;
}

export interface PracticeStore extends PracticeSummary {
  setSession(sessionId: string): void;
  /**
   * 카테고리만 정해진 상태. 질문은 서버에서 받아야 하므로 아직 없다.
   *
   * 이 액션이 따로 있는 이유 — 예전에는 호출부가 `selectQuestion(category, category)`처럼
   * 카테고리를 questionId 자리에 넣어 **없는 식별자를 지어내고 있었다.**
   * 스토어가 "카테고리는 정해졌고 질문은 미정"을 표현하지 못한 것이 원인이었다.
   */
  selectCategory(category: QuestionCategory): void;
  /** 실제 질문을 받은 뒤 호출한다. questionId는 서버가 준 값이어야 한다. */
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
  // 카테고리를 바꾸면 이전 질문은 무효다 — questionId를 명시적으로 비운다.
  selectCategory: (category) => set({ category, questionId: null }),
  selectQuestion: (category, questionId) => set({ category, questionId }),
  setRecordingState: (recordingState) => set({ recordingState }),
  setAnswerId: (answerId) => set({ answerId }),
  reset: () => set({ ...INITIAL }),
}));
