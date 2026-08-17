// Mock 자체의 신뢰성 테스트 — 테스트 도구가 틀리면 S1~S9 전체가 무의미하다 (재발 방지: 도구 먼저 검증).
import { afterEach, describe, expect, it } from "vitest";
import { installMockWebSocket, MockWebSocket, type MockCloseEvent } from "./mock-websocket";

afterEach(() => {
  MockWebSocket.reset();
});

describe("MockWebSocket — 브라우저 동작 모사", () => {
  it("초기 상태: CONNECTING · binaryType 기본 'blob' (§3.5 설정 누락 검출 전제)", () => {
    const ws = new MockWebSocket("wss://example.test/ws");
    expect(ws.readyState).toBe(MockWebSocket.CONNECTING);
    expect(ws.binaryType).toBe("blob");
  });

  it("CONNECTING 중 send는 InvalidStateError — 인증 전 송신 결함을 표면화 (§2.2.4)", () => {
    const ws = new MockWebSocket("wss://example.test/ws");
    expect(() => ws.send("x")).toThrow(/InvalidStateError/);
  });

  it("serverOpen → OPEN·onopen 발화, send 로그 축적", () => {
    const ws = new MockWebSocket("wss://example.test/ws");
    let opened = false;
    ws.onopen = () => {
      opened = true;
    };
    ws.serverOpen();
    expect(opened).toBe(true);
    ws.send("a");
    expect(ws.sent).toEqual(["a"]);
  });

  it("close 코드 검증 — 1000·3000~4999만 허용, 그 외 InvalidAccessError (「종료 코드」)", () => {
    const ws = new MockWebSocket("wss://example.test/ws");
    ws.serverOpen();
    expect(() => ws.close(2999)).toThrow(/InvalidAccessError/);
    expect(() => ws.close(5000)).toThrow(/InvalidAccessError/);
    expect(() => ws.close(4008)).not.toThrow();
    expect(ws.clientCloses).toEqual([{ code: 4008, reason: undefined }]);
    expect(ws.readyState).toBe(MockWebSocket.CLOSING);
  });

  it("close 후 send는 조용히 폐기 (브라우저 동작)", () => {
    const ws = new MockWebSocket("wss://example.test/ws");
    ws.serverOpen();
    ws.close(1000);
    ws.send("dropped");
    expect(ws.sent).toEqual([]);
  });

  it("serverClose는 어떤 상태에서든 1회만 onclose — 코드·wasClean 전달", () => {
    const ws = new MockWebSocket("wss://example.test/ws");
    const events: MockCloseEvent[] = [];
    ws.onclose = (ev) => {
      events.push(ev);
    };
    ws.serverClose(1006);
    ws.serverClose(1000); // CLOSED 후 재호출은 no-op
    expect(events).toEqual([{ code: 1006, reason: "", wasClean: false }]);
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });

  it("serverError → onerror 후 onclose(1006) — 실브라우저 순서 (§2.3.1 최빈 경로)", () => {
    const ws = new MockWebSocket("wss://example.test/ws");
    const order: string[] = [];
    ws.onerror = () => order.push("error");
    ws.onclose = (ev) => order.push(`close:${ev.code}`);
    ws.serverError();
    expect(order).toEqual(["error", "close:1006"]);
  });

  it("serverEnvelope — JSON 직렬화 주입", () => {
    const ws = new MockWebSocket("wss://example.test/ws");
    ws.serverOpen();
    const received: unknown[] = [];
    ws.onmessage = (ev) => received.push(ev.data);
    ws.serverEnvelope({ v: 1, type: "pong", seq: 1, ts: 0 });
    expect(received).toEqual(['{"v":1,"type":"pong","seq":1,"ts":0}']);
  });

  it("installMockWebSocket — 전역 교체·레지스트리·복원", () => {
    const restore = installMockWebSocket();
    const Ctor = (globalThis as { WebSocket?: unknown }).WebSocket as typeof MockWebSocket;
    expect(Ctor).toBe(MockWebSocket);
    const ws = new Ctor("wss://example.test/ws");
    expect(MockWebSocket.latest()).toBe(ws);
    restore();
    expect((globalThis as { WebSocket?: unknown }).WebSocket).not.toBe(MockWebSocket);
    expect(() => MockWebSocket.latest()).toThrow();
  });
});
