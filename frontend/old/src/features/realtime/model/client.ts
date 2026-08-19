// ⚠ 구계약(wave0) 시절 뼈대 — M2에서 §2·§3 규범(8상태 기계·티켓 auth·resume·하트비트)으로 재작성한다.
// 메시지 카탈로그의 규범은 §3.1 EnvelopeType 14종 (shared/protocol/envelope.ts). 이 파일을 새 코드의 참고로 삼지 말 것.
// URL의 경로 파라미터 방식도 G-4 협의 대상 (I-6). M1에서는 동작 변경 없이 이관만 수행했다.

type WsMessage = { type: string; [key: string]: unknown };
type MessageHandler = (msg: WsMessage) => void;

export class SessionSocket {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];

  connect(sessionId: string, base = import.meta.env.VITE_WS_BASE ?? "") {
    this.ws = new WebSocket(`${base}/ws/v1/sessions/${sessionId}`);
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as WsMessage;
      this.handlers.forEach((h) => h(msg));
    };
    // TODO: session.hello 핸드셰이크, 재연결, 백프레셔(pose.chunk 10Hz) 처리
  }

  send(msg: WsMessage) {
    this.ws?.send(JSON.stringify(msg));
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
  }

  close() {
    this.ws?.close();
  }
}
