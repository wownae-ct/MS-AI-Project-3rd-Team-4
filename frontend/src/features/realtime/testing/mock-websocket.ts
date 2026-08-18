// §7.2 — 상태 기계 테스트용 WebSocket 이중체(double). **테스트 전용 — 프로덕션 코드에서 import 금지.**
// close 코드·지연·무응답(auth 무시 등)을 서버 측 제어 메서드로 주입한다. vi.useFakeTimers와 조합해
// 「핸드셰이크 타임아웃」·「하트비트」·「백오프」 발화를 결정론적으로 재현한다 (04 문서 §2).

type MessageData = string | ArrayBuffer;

export interface MockCloseEvent {
  code: number;
  reason: string;
  wasClean: boolean;
}

export interface MockMessageEvent {
  data: MessageData;
}

type OpenHandler = (() => void) | null;
type MessageHandler = ((ev: MockMessageEvent) => void) | null;
type CloseHandler = ((ev: MockCloseEvent) => void) | null;
type ErrorHandler = (() => void) | null;

export class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  /** 생성 순서대로의 인스턴스 레지스트리 — 재연결 시나리오에서 "몇 번째 연결"을 집는 용도 */
  static instances: MockWebSocket[] = [];

  static reset(): void {
    MockWebSocket.instances = [];
  }

  /** 마지막(현재) 연결 — 없으면 테스트 자체의 결함이므로 즉시 실패시킨다 */
  static latest(): MockWebSocket {
    const last = MockWebSocket.instances.at(-1);
    if (!last) throw new Error("MockWebSocket 인스턴스가 없습니다 — 연결 시도가 일어나지 않은 테스트 경로");
    return last;
  }

  readonly url: string;
  readyState: number = MockWebSocket.CONNECTING;
  binaryType: "blob" | "arraybuffer" = "blob"; // 브라우저 기본값 그대로 — §3.5의 'arraybuffer' 설정 누락을 검출하기 위함

  /** 클라이언트가 send한 데이터 로그 (검증용) */
  readonly sent: MessageData[] = [];
  /** 클라이언트가 호출한 close(code, reason) 로그 (검증용 — intentionalClose 경로 단언) */
  readonly clientCloses: { code?: number; reason?: string }[] = [];

  onopen: OpenHandler = null;
  onmessage: MessageHandler = null;
  onclose: CloseHandler = null;
  onerror: ErrorHandler = null;

  // addEventListener 스타일도 지원 — on* 전용이면 machine 구현이 EventTarget 스타일일 때 이벤트가 조용히 유실된다
  private readonly listeners: Record<"open" | "message" | "close" | "error", ((ev?: unknown) => void)[]> = {
    open: [],
    message: [],
    close: [],
    error: [],
  };

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: "open" | "message" | "close" | "error", listener: (ev?: unknown) => void): void {
    this.listeners[type].push(listener);
  }

  removeEventListener(type: "open" | "message" | "close" | "error", listener: (ev?: unknown) => void): void {
    const arr = this.listeners[type];
    const i = arr.indexOf(listener);
    if (i >= 0) arr.splice(i, 1);
  }

  private dispatch(type: "open" | "message" | "close" | "error", ev?: unknown): void {
    // 스냅샷 순회 — 디스패치 중 리스너가 자기 자신을 제거해도 나머지가 건너뛰어지지 않는다
    const snapshot = this.listeners[type].slice();
    for (const l of snapshot) l(ev);
  }

  // ── 클라이언트 측 API (WebSocket 표준 동작 모사) ──────────────────────────

  send(data: MessageData): void {
    if (this.readyState === MockWebSocket.CONNECTING) {
      // 실제 브라우저는 CONNECTING 중 send에 InvalidStateError를 던진다
      throw new Error("InvalidStateError: CONNECTING 상태에서 send 호출 (§2.2.4 인증 전 송신 경로 결함)");
    }
    if (this.readyState !== MockWebSocket.OPEN) return; // CLOSING/CLOSED: 조용히 폐기 (브라우저 동작)
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    // 실제 브라우저: 1000 또는 3000~4999 외에는 InvalidAccessError.
    // 규범(§2.3.1)은 그중에서도 클라이언트 사용을 1000·4000~4999로 한정한다 — 3xxx 사용은 리뷰에서 차단.
    if (code !== undefined && code !== 1000 && (code < 3000 || code > 4999)) {
      throw new Error(`InvalidAccessError: close code ${code} (허용: 1000 또는 3000~4999 — 규범은 1000·4xxx만)`);
    }
    this.clientCloses.push({ code, reason });
    if (this.readyState === MockWebSocket.CLOSED || this.readyState === MockWebSocket.CLOSING) return;
    this.readyState = MockWebSocket.CLOSING;
    // 종결 핸드셰이크 완료(CLOSED + onclose)는 serverClose()로 명시 주입한다 —
    // 자동 완료하면 "close 후 onclose 지연·유실" 경합을 재현할 수 없다 (§2.3.2 S4).
  }

  // ── 서버/네트워크 측 주입 (테스트 제어) ──────────────────────────────────

  /** 핸드셰이크 성공 — onopen 발화 */
  serverOpen(): void {
    if (this.readyState !== MockWebSocket.CONNECTING) return;
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
    this.dispatch("open");
  }

  /** 서버 → 클라이언트 메시지 */
  serverMessage(data: MessageData): void {
    if (this.readyState !== MockWebSocket.OPEN) return;
    this.onmessage?.({ data });
    this.dispatch("message", { data });
  }

  /** JSON Envelope 편의 주입 */
  serverEnvelope(envelope: Record<string, unknown>): void {
    this.serverMessage(JSON.stringify(envelope));
  }

  /**
   * 연결 종결 — 어떤 readyState에서든 호출 가능 (연결 실패·전송 중 절단·close 응답 전부 재현).
   * 브라우저 합성 1006/1005 경로도 이 메서드로 주입한다.
   */
  serverClose(code = 1005, reason = "", wasClean = false): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    const ev: MockCloseEvent = { code, reason, wasClean };
    this.onclose?.(ev);
    this.dispatch("close", ev);
  }

  /** 네트워크 에러 — 실제 브라우저처럼 onerror 뒤 onclose(1006)가 따라온다 */
  serverError(withClose = true): void {
    this.onerror?.();
    this.dispatch("error");
    if (withClose) this.serverClose(1006, "", false);
  }
}

/**
 * globalThis.WebSocket을 Mock으로 교체하고 복원 함수를 돌려준다.
 * 사용: const restore = installMockWebSocket(); ... ; restore();
 */
export function installMockWebSocket(): () => void {
  const g = globalThis as { WebSocket?: unknown };
  const original = g.WebSocket;
  MockWebSocket.reset();
  g.WebSocket = MockWebSocket as unknown;
  return () => {
    g.WebSocket = original;
    MockWebSocket.reset();
  };
}
