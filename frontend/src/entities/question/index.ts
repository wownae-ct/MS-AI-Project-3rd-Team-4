// question 슬라이스 public API — 슬라이스 밖에서는 이 파일만 import한다.
export type { Question, QuestionCategory } from "./model";
export * as questionApi from "./api";
