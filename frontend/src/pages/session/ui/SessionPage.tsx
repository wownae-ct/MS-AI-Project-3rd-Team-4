// 세션 화면 (§6.1 — features 조립 지점). 카메라·오버레이 실배선은 M3, WS는 M2에서 이 화면에 연결된다.
// FSD: pages는 app을 import하지 못하므로 스토어 값·핸들러는 app이 props로 내려준다 (§6.1.1 하향 규칙).
import type { SocketState } from "../../../features/realtime";
import type { AudioUnlockState, WakeLockState } from "../../../shared/lib";
import { Banner, Button, IconRefresh, IconScreenLock } from "../../../shared/ui";

export interface SessionPageProps {
  connection: SocketState;
  repCount: number;
  setIndex: number;
  currentFaultCode: string | null;
  wakeLockState: WakeLockState;
  audioState: AudioUnlockState;
  /** §4.5.1 rule_params 강등 상태 — 'default' 번들 기본값 적용 · 'disabled' 코칭 비활성 (조용한 비활성화 금지) */
  coachingNotice: "default" | "disabled" | null;
  /** 「백오프」 — 네트워크성 실패 한도 초과 시 수동 버튼 노출 */
  showManualReconnect: boolean;
  sessionActive: boolean;
  /** §4.5.2 큐 자막 (청각 접근성) */
  cueCaption: string | null;
  onStartGesture: () => void;
  onEndSession: () => void;
  onManualReconnect: () => void;
}

const CONNECTION_LABEL: Record<SocketState, string> = {
  DISCONNECTED: "연결 안 됨",
  CONNECTING: "연결 중",
  AUTHENTICATING: "인증 중",
  RESUMING: "동기화 중",
  CONNECTED: "연결됨",
  RECONNECTING: "재연결 중",
  RESYNC_FAILED: "재동기화 실패",
  FAILED: "연결 실패",
};

export function SessionPage(props: SessionPageProps) {
  const wakeLockDegraded =
    props.wakeLockState === "failed" ||
    props.wakeLockState === "released-auto" ||
    props.wakeLockState === "unsupported";

  return (
    <main className="page">
      <h1 className="page__title">세션</h1>

      {props.audioState === "blocked" && (
        <Banner variant="danger">
          오디오를 켤 수 없어 세션을 시작할 수 없습니다. 기기의 소리 설정을 확인한 뒤 다시 시도해 주세요.
        </Banner>
      )}
      {wakeLockDegraded && (
        <Banner variant="warning">
          <IconScreenLock /> 화면 켜짐 유지가 동작하지 않아 운동 중 화면이 꺼질 수 있습니다. 기기 화면 자동
          꺼짐 시간을 늘려 주세요.
        </Banner>
      )}
      {props.coachingNotice === "default" && (
        <Banner variant="info">코칭 기준을 기본값으로 적용 중입니다 (서버 기준 미수신).</Banner>
      )}
      {props.coachingNotice === "disabled" && (
        <Banner variant="warning">실시간 코칭이 비활성 상태입니다. 자세 기록만 진행됩니다.</Banner>
      )}
      {props.showManualReconnect && (
        <Banner
          variant="warning"
          action={
            <Button variant="secondary" onClick={props.onManualReconnect}>
              <IconRefresh /> 다시 연결
            </Button>
          }
        >
          서버와 연결이 계속 끊어집니다.
        </Banner>
      )}

      <div className="session-stage">
        {/* M3: <video>(카메라 프리뷰) + 오버레이 캔버스(메인 소유 §4.2)가 이 자리에 배선된다 */}
        <span>{props.sessionActive ? "카메라 파이프라인 연결 대기 (M3)" : "세션을 시작하면 카메라가 켜집니다"}</span>
      </div>

      <p className="cue-caption" role="status" aria-label="코칭 안내 자막">
        {props.cueCaption ?? ""}
      </p>

      <div className="stat-row" aria-label="세션 요약">
        <div className="stat">
          <span className="stat__value">{props.repCount}</span>
          <span className="stat__label">렙</span>
        </div>
        <div className="stat">
          <span className="stat__value">{props.setIndex + 1}</span>
          <span className="stat__label">세트</span>
        </div>
        <div className="stat">
          <span className="stat__value">{CONNECTION_LABEL[props.connection]}</span>
          <span className="stat__label">연결</span>
        </div>
      </div>
      {props.currentFaultCode && <Banner variant="warning">자세 교정 필요: {props.currentFaultCode}</Banner>}

      {props.sessionActive ? (
        <Button variant="danger" onClick={props.onEndSession}>
          세션 종료
        </Button>
      ) : (
        <Button onClick={props.onStartGesture}>세션 시작</Button>
      )}
    </main>
  );
}
