// SSE 파서 계약 — docs/architecture/chat-streaming.md §3 · §9.
//
// **로컬에는 인그레스가 없어 실제 분할·잡음을 재현할 수 없다.** 그래서 이 실패 모드들은 실행이
// 아니라 픽스처로만 고정된다 — 그 문서 §9 가 "계약 픽스처로만 고정된다"고 적어 둔 자리다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendChatMessage, type SendMessageHandlers } from "./chat";

const encoder = new TextEncoder();

/** 바이트 조각들을 그대로 흘리는 200 응답. 청크 경계를 테스트가 직접 정한다. */
function streamResponse(chunks: Uint8Array[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function textChunks(...parts: string[]): Uint8Array[] {
  return parts.map((part) => encoder.encode(part));
}

/** 호출된 이벤트를 순서대로 모으는 핸들러 묶음. */
function collector() {
  const tokens: string[] = [];
  const events: string[] = [];
  const handlers: SendMessageHandlers = {
    onToken: (delta) => {
      tokens.push(delta);
      events.push("token");
    },
    onCitations: () => events.push("citations"),
    onVerification: () => events.push("verification"),
    onStage: () => events.push("stage"),
    onRetry: () => events.push("retry"),
    onDone: () => events.push("done"),
    onError: () => events.push("error"),
  };
  return { tokens, events, handlers };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

async function run(chunks: Uint8Array[]) {
  const { tokens, events, handlers } = collector();
  fetchMock.mockResolvedValue(streamResponse(chunks));
  await sendChatMessage("s1", "질문", handlers);
  return { tokens, events };
}

describe("청크 경계", () => {
  it("프레임 한가운데서 끊겨도 다음 청크와 이어 붙여 조립한다", async () => {
    const { tokens, events } = await run(
      textChunks('event: token\ndata: {"del', 'ta":"안녕"}\n\nevent: done\ndata: {"message_id":"m1","latency_ms":1}\n\n'),
    );
    expect(tokens).toEqual(["안녕"]);
    expect(events).toEqual(["token", "done"]);
  });

  it("🚨 UTF-8 문자 중간에서 끊겨도 한글이 깨지지 않는다", async () => {
    // 디코더 인스턴스를 스트림당 하나로 유지하고 `stream: true` 를 줘야만 성립한다 — 이 계약이
    // 깨지면 3바이트 한글의 앞 조각이 U+FFFD 로 확정돼 버린다(§3.2 #7).
    const frame = encoder.encode('event: token\ndata: {"delta":"안녕하세요"}\n\n');
    const cut = frame.indexOf(0xed) + 1; // "안"(ED 95 88)의 첫 바이트 바로 뒤
    const { tokens } = await run([frame.slice(0, cut), frame.slice(cut)]);
    expect(tokens).toEqual(["안녕하세요"]);
  });
});

describe("명세가 요구하는 줄바꿈 3종", () => {
  it("CRLF 로 온 프레임도 LF 와 똑같이 파싱된다", async () => {
    const { tokens, events } = await run(textChunks('event: token\r\ndata: {"delta":"가"}\r\n\r\n'));
    expect(tokens).toEqual(["가"]);
    expect(events).toEqual(["token"]);
  });

  it("CRLF 가 청크 경계에 걸려도 프레임이 한가운데서 잘리지 않는다", async () => {
    // `\r` 을 그 자리에서 LF 로 바꿔 버리면 다음 청크의 `\n` 과 만나 가짜 프레임 구분자가 된다.
    const { tokens, events } = await run(textChunks('event: token\r', '\ndata: {"delta":"가"}\r\n\r\n'));
    expect(tokens).toEqual(["가"]);
    expect(events).toEqual(["token"]);
  });
});

describe("잡음", () => {
  it(": 주석 줄(heartbeat)은 조용히 무시한다", async () => {
    const { tokens, events } = await run(
      textChunks(': heartbeat\n\nevent: token\ndata: {"delta":"가"}\n\n: heartbeat\n\n'),
    );
    expect(tokens).toEqual(["가"]);
    expect(events).toEqual(["token"]);
  });

  it("🚨 프레임 하나가 깨져도 그 프레임만 버리고 답변을 계속 받는다", async () => {
    // 종전엔 이 JSON.parse 가 무방비라 예외가 read 루프 밖으로 튀어 **스트림 전체가 죽었다** —
    // 이미 화면에 흐르던 답변까지 통째로 사라지고 일반 에러 문구만 남는다.
    const { tokens, events } = await run(
      textChunks(
        'event: token\ndata: {"delta":"가"}\n\n',
        "event: token\ndata: {깨진 JSON\n\n",
        'event: token\ndata: {"delta":"나"}\n\nevent: done\ndata: {"message_id":"m1","latency_ms":1}\n\n',
      ),
    );
    expect(tokens).toEqual(["가", "나"]);
    expect(events).toEqual(["token", "token", "done"]);
  });

  it("모르는 이벤트 이름은 무시한다 — 백엔드가 종류를 늘려도 화면이 깨지지 않는다", async () => {
    const { events } = await run(textChunks('event: 아직없는이벤트\ndata: {"x":1}\n\n'));
    expect(events).toEqual([]);
  });
});
