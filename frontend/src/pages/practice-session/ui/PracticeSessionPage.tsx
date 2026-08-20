// 연습 세션 화면 — 질문 카드 + 카테고리 선택 + 타이머/녹음 자리. 브리프코치_프로젝트_기획서_초안.md §4 화면 1.
// 질문 뱅크 API는 백엔드 501 스텁이라 연동 전 상태를 명시한다 (조용한 실패 금지).
// FSD: pages는 app을 import하지 못하므로 스토어 값·핸들러는 app이 props로 내려준다.
import type { QuestionCategory } from "@/entities/question";
import type { RecordingState } from "@/entities/practice-session";
import type { AudioUnlockState, WakeLockState } from "@/shared/lib";
import { Banner, Button } from "@/shared/ui";

const CATEGORY_LABEL: Record<QuestionCategory, string> = {
  tech_interview: "기술면접",
  customer_explain: "고객 설명",
  incident_report: "장애 보고",
};

/** 백엔드 questions API 확정 전 임시 항목 — 연동 시 교체 (shared/api/questions.ts) */
const PLACEHOLDER_CATEGORIES: QuestionCategory[] = ["tech_interview", "customer_explain", "incident_report"];

export interface PracticeSessionPageProps {
  category: QuestionCategory | null;
  onSelectCategory: (category: QuestionCategory) => void;
  audioState: AudioUnlockState;
  wakeLockState: WakeLockState;
  recordingState: RecordingState;
  onStartGesture: () => void;
  onSubmit: () => void;
}

export function PracticeSessionPage(props: PracticeSessionPageProps) {
  const wakeLockDegraded =
    props.wakeLockState === "failed" ||
    props.wakeLockState === "released-auto" ||
    props.wakeLockState === "unsupported";
  const isRecording = props.recordingState === "recording";

  return (
    <main className="page">
      <h1 className="page__title">연습 세션</h1>
      <p className="page__subtitle">카테고리를 선택하고 제한시간 안에 답변을 녹음하세요.</p>
      <Banner variant="info">질문 목록은 서버 연동 전 임시 항목입니다.</Banner>

      {props.audioState === "blocked" && (
        <Banner variant="danger">
          마이크를 켤 수 없어 녹음을 시작할 수 없습니다. 기기의 마이크 권한을 확인한 뒤 다시 시도해 주세요.
        </Banner>
      )}
      {wakeLockDegraded && (
        <Banner variant="warning">화면 켜짐 유지가 동작하지 않아 녹음 중 화면이 꺼질 수 있습니다.</Banner>
      )}

      {PLACEHOLDER_CATEGORIES.map((category) => (
        <button
          key={category}
          type="button"
          className={`card card--selectable${props.category === category ? " card--selected" : ""}`}
          aria-pressed={props.category === category}
          onClick={() => props.onSelectCategory(category)}
        >
          <strong>{CATEGORY_LABEL[category]}</strong>
        </button>
      ))}

      {isRecording ? (
        <Button variant="danger" onClick={props.onSubmit}>
          녹음 종료 및 제출
        </Button>
      ) : (
        <Button onClick={props.onStartGesture} disabled={!props.category}>
          녹음 시작
        </Button>
      )}
    </main>
  );
}
