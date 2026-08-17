// app 조립 (§6.1.1) — 진입 판정 → 화면 페이즈 전환 → 세션 제스처(오디오 언락 §4.5.2 + Wake Lock §5.3) 배선.
// features 간 연결은 여기(app)와 pages/session만 담당한다. 스토어 값은 props로 하향 주입 (pages는 app import 금지).
// 화면 전환은 선형 플로우(선택→세션→리포트)라 상태 기반 — 라우터 도입은 의존성 추가 승인 대상이라 보류.
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { collectFeatureSupport, GuardScreen, resolveEntryGuard, type EntryVerdict } from "../features/entry-guard";
import { MovementSelectPage } from "../pages/movement-select";
import { SessionPage } from "../pages/session";
import { ReportPage } from "../pages/report";
import { AudioUnlock, WakeLockManager, type AudioUnlockState, type WakeLockState } from "../shared/lib";
import { sessionStore } from "./store/session-store";

type Phase = "select" | "session" | "report";

interface AppProps {
  /** 테스트 주입용 — 미지정 시 실제 UA·기능 검사로 판정 (§6.2.1) */
  guardVerdict?: EntryVerdict;
}

function App({ guardVerdict }: AppProps) {
  // 진입 판정은 최초 1회 — 세션 도중 UA가 바뀌는 경우는 없다
  const [verdict] = useState<EntryVerdict>(
    () => guardVerdict ?? resolveEntryGuard(navigator.userAgent, collectFeatureSupport()),
  );
  const [phase, setPhase] = useState<Phase>("select");
  const [sessionActive, setSessionActive] = useState(false);

  const [wakeLockState, setWakeLockState] = useState<WakeLockState>("inactive");
  const [audioState, setAudioState] = useState<AudioUnlockState>("locked");
  const wakeRef = useRef<WakeLockManager | null>(null);
  wakeRef.current ??= new WakeLockManager({ onStateChange: setWakeLockState });
  const audioRef = useRef<AudioUnlock | null>(null);
  audioRef.current ??= new AudioUnlock({ onStateChange: setAudioState });

  const repCount = useStore(sessionStore, (s) => s.repCount);
  const setIndex = useStore(sessionStore, (s) => s.setIndex);
  const currentFaultCode = useStore(sessionStore, (s) => s.currentFaultCode);
  const connection = useStore(sessionStore, (s) => s.connection);

  // §5.3 재획득은 visible/pageshow 복귀에서만 · §5.1 pagehide에서 명시 해제
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") void wakeRef.current?.reacquireOnReturn();
    };
    const onPageShow = () => void wakeRef.current?.reacquireOnReturn();
    const onPageHide = () => void wakeRef.current?.release();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  if (verdict.kind !== "ok") {
    return <GuardScreen verdict={verdict} currentUrl={window.location.href} />;
  }

  // §4.5.2·§5.3 — 동일 제스처 핸들러에서 오디오 언락과 Wake Lock을 함께 수행.
  // 오디오가 running이 아니면 세션 시작 차단(P0에 준하는 규범) · Wake Lock 실패는 차단이 아니라 배너.
  const startSessionGesture = async (): Promise<void> => {
    const audioOk = await audioRef.current?.unlockFromGesture();
    if (!audioOk) return;
    await wakeRef.current?.acquireFromGesture();
    setSessionActive(true);
    // M2·M3: 여기서 티켓 발급→WS 연결, 카메라 획득→Worker 파이프라인이 이어진다
  };

  const endSession = (): void => {
    void wakeRef.current?.release();
    setSessionActive(false);
    setPhase("report");
  };

  if (phase === "select") {
    return <MovementSelectPage onStart={() => setPhase("session")} />;
  }
  if (phase === "session") {
    return (
      <SessionPage
        connection={connection}
        repCount={repCount}
        setIndex={setIndex}
        currentFaultCode={currentFaultCode}
        wakeLockState={wakeLockState}
        audioState={audioState}
        coachingNotice={null} /* M4 잔여: params-loader 연동 시 §4.5.1 강등 상태 반영 */
        showManualReconnect={false} /* M2: 「백오프」 수동 버튼 조건 연동 */
        sessionActive={sessionActive}
        cueCaption={null} /* M4 잔여: CueScheduler 재생 콜백에서 자막 주입 */
        onStartGesture={() => void startSessionGesture()}
        onEndSession={endSession}
        onManualReconnect={() => undefined}
      />
    );
  }
  return (
    <ReportPage
      repCount={repCount}
      setIndex={setIndex}
      onRestart={() => {
        sessionStore.getState().resetSession();
        setPhase("select");
      }}
    />
  );
}

export default App;
