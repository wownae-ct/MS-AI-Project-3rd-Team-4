// app 조립 — 진입 판정 → 화면 페이즈 전환(연습→피드백→히스토리) → 녹음 제스처(오디오 언락 + Wake Lock) 배선.
// features 간 연결은 여기(app)와 각 page만 담당한다. 스토어 값은 props로 하향 주입 (pages는 app import 금지).
// 화면 전환은 선형 플로우라 상태 기반 — 라우터 도입은 의존성 추가 승인 대상이라 보류.
import { useRef, useState } from "react";
import { useStore } from "zustand";
import { collectFeatureSupport, GuardScreen, resolveEntryGuard, type EntryVerdict } from "../features/entry-guard";
import { PracticeSessionPage } from "../pages/practice-session";
import { FeedbackPage } from "../pages/feedback";
import { ReportPage } from "../pages/report";
import { AudioUnlock, WakeLockManager, type AudioUnlockState, type WakeLockState } from "../shared/lib";
import { practiceStore } from "./store/practice-store";
import type { QuestionCategory } from "../entities/question";

type Phase = "practice" | "feedback" | "report";

interface AppProps {
  /** 테스트 주입용 — 미지정 시 실제 UA·기능 검사로 판정 */
  guardVerdict?: EntryVerdict;
}

function App({ guardVerdict }: AppProps) {
  // 진입 판정은 최초 1회 — 세션 도중 UA가 바뀌는 경우는 없다
  const [verdict] = useState<EntryVerdict>(
    () =>
      guardVerdict ??
      resolveEntryGuard(navigator.userAgent, collectFeatureSupport(), {
        maxTouchPoints: navigator.maxTouchPoints,
      }),
  );
  const [phase, setPhase] = useState<Phase>("practice");

  const [wakeLockState, setWakeLockState] = useState<WakeLockState>("inactive");
  const [audioState, setAudioState] = useState<AudioUnlockState>("locked");
  const wakeRef = useRef<WakeLockManager | null>(null);
  wakeRef.current ??= new WakeLockManager({ onStateChange: setWakeLockState });
  const audioRef = useRef<AudioUnlock | null>(null);
  audioRef.current ??= new AudioUnlock({ onStateChange: setAudioState });

  const category = useStore(practiceStore, (s) => s.category);
  const recordingState = useStore(practiceStore, (s) => s.recordingState);

  if (verdict.kind !== "ok") {
    return <GuardScreen verdict={verdict} currentUrl={window.location.href} />;
  }

  // 동일 제스처 핸들러에서 오디오 언락과 Wake Lock을 함께 수행.
  // 오디오가 running이 아니면 녹음 시작 차단 · Wake Lock 실패는 차단이 아니라 배너.
  const startRecordingGesture = async (): Promise<void> => {
    const audioOk = await audioRef.current?.unlockFromGesture();
    if (!audioOk) return;
    await wakeRef.current?.acquireFromGesture();
    practiceStore.getState().setRecordingState("recording");
    // 다음 단계: 여기서 MediaRecorder 시작 → 타이머 종료 시 자동 제출로 이어진다
  };

  const submitAnswer = (): void => {
    void wakeRef.current?.release();
    practiceStore.getState().setRecordingState("processing");
    // 다음 단계: shared/api/answers.ts submitAnswer + SSE 피드백 스트림 연동
    setPhase("feedback");
  };

  if (phase === "practice") {
    return (
      <PracticeSessionPage
        category={category}
        onSelectCategory={(c: QuestionCategory) => practiceStore.getState().selectQuestion(c, c)}
        audioState={audioState}
        wakeLockState={wakeLockState}
        recordingState={recordingState}
        onStartGesture={() => void startRecordingGesture()}
        onSubmit={submitAnswer}
      />
    );
  }
  if (phase === "feedback") {
    return (
      <FeedbackPage
        feedback={null}
        metrics={null}
        onNext={() => setPhase("report")}
      />
    );
  }
  return (
    <ReportPage
      onRestart={() => {
        practiceStore.getState().reset();
        setPhase("practice");
      }}
    />
  );
}

export default App;
