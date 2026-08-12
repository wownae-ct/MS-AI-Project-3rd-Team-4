// backend/app/gateway/routers/ws.py 대응 (/ws/v1/sessions/{id}).
// 메시지 카탈로그(session.hello, pose.chunk, rep.verdict, coach.delta 등)는 wave0_contract.html 참고.
// 백엔드가 아직 핸드셰이크 미구현(TODO)이라 여기도 뼈대만.

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
