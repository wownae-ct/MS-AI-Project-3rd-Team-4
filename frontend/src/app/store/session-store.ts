// §1.1 전역 세션 스토어 (Zustand) — 두 층으로 엄격 분리한다:
//   ① 요약치(이 스토어): 렙 카운트·현재 fault·연결 상태·세트 진행도 — 컴포넌트 노출, 갱신 10Hz 스로틀
//   ② transient(아래 가변 슬롯): 프레임 단위 고빈도(랜드마크 등) — React state 승격 금지,
//      구독 알림 없이 오버레이 rAF 루프가 직접 읽는다 (§4.2)
import { createStore } from "zustand/vanilla";
import type { SocketState } from "../../features/realtime";
import { SUMMARY_UPDATE_INTERVAL_MS } from "../../shared/config";

export interface SessionSummary {
  connection: SocketState;
  repCount: number;
  /** fault 상세 스키마는 백엔드 확정 전 — 코드 문자열만 유지 (§0: 타입을 지어내지 않는다) */
  currentFaultCode: string | null;
  setIndex: number;
}

export interface SessionSummaryStore extends SessionSummary {
  /** 연결 상태는 저빈도 이벤트라 스로틀 없이 즉시 반영 */
  setConnection(connection: SocketState): void;
  /** 요약치 병합 — 고빈도 생산자는 직접 호출하지 말고 createSummaryThrottle 경유 (§1.1) */
  applySummary(patch: Partial<Omit<SessionSummary, "connection">>): void;
  resetSession(): void;
}

const INITIAL: SessionSummary = {
  connection: "DISCONNECTED",
  repCount: 0,
  currentFaultCode: null,
  setIndex: 0,
};

export const sessionStore = createStore<SessionSummaryStore>()((set) => ({
  ...INITIAL,
  setConnection: (connection) => set({ connection }),
  applySummary: (patch) => set(patch),
  resetSession: () => set({ ...INITIAL }),
}));

/** ② transient 층 — 알림 없는 가변 슬롯. 쓰기는 vision 콜백, 읽기는 rAF(오버레이·룰 표시)만. */
export interface TransientPose {
  /** CANON19 정규 좌표 (Worker 반환 구조화 복제본) — null이면 아직 미수신 */
  landmarks: Float32Array | null;
  tOffsetMs: number;
}

export const transientPose: TransientPose = { landmarks: null, tOffsetMs: 0 };

export function writeTransientPose(landmarks: Float32Array, tOffsetMs: number): void {
  transientPose.landmarks = landmarks;
  transientPose.tOffsetMs = tOffsetMs;
}

/**
 * §1.1 요약치 10Hz 스로틀 — 고빈도 판정 경로가 요약치를 패치로 밀어 넣으면
 * 간격 경과 시에만 스토어에 병합 반영한다. flush()는 세션 종료 등 강제 반영용.
 */
export function createSummaryThrottle(
  apply: (patch: Partial<Omit<SessionSummary, "connection">>) => void = sessionStore.getState().applySummary,
  now: () => number = () => performance.now(),
): {
  push(patch: Partial<Omit<SessionSummary, "connection">>): void;
  flush(): void;
} {
  let lastFlushMs = Number.NEGATIVE_INFINITY;
  let pending: Partial<Omit<SessionSummary, "connection">> | null = null;

  const flush = (): void => {
    if (!pending) return;
    apply(pending);
    pending = null;
  };

  return {
    push(patch) {
      pending = { ...pending, ...patch };
      const t = now();
      if (t - lastFlushMs >= SUMMARY_UPDATE_INTERVAL_MS) {
        lastFlushMs = t;
        flush();
      }
    },
    flush() {
      lastFlushMs = now();
      flush();
    },
  };
}
