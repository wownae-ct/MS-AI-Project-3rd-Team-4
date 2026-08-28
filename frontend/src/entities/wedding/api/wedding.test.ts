// createWedding — 응답이 JSON 단발 → SSE 스트림(text/event-stream)으로 바뀐 뒤(2026-08-28)의
// 프레임 파싱 계약을 고정한다. heartbeat 주석 줄 무시, done/error 이벤트 분기, 스트림 시작 전
// 422 는 평범한 JSON 에러로 처리되는 것, fetch 자체 실패가 client.ts::classifyFetchFailure 로
// 분류되는 것을 검증한다. sendChatMessage(entities/chat/api/chat.test.ts 부재와 동일하게 이
// 계층은 chat.ts 에도 전용 테스트가 없다)와 달리 여기는 실제 프로덕션 인시던트(2026-08-27
// 온보딩 타임아웃 카테고리 유실 버그)의 재발 방지가 걸려 있어 직접 테스트한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isApiError, PERSONALIZATION_TIMEOUT_MS } from "@/shared/api";
import { createWedding } from "./wedding";
import type { WeddingCreateInput, WeddingProfile } from "../model/types";

function sseResponse(chunks: string[], status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { "content-type": "text/event-stream" } });
}

const MINIMAL_INPUT: WeddingCreateInput = {
  user_role: "BRIDE",
  wedding_date_precision: "EXACT",
  total_budget_unsure: false,
  region_code: "SEOUL_OTHER",
  guest_count_unsure: false,
  categories: [],
};

const MINIMAL_PROFILE: WeddingProfile = {
  id: "w1",
  user_role: "BRIDE",
  wedding_date_precision: "EXACT",
  total_budget_unsure: false,
  region_code: "SEOUL_OTHER",
  guest_count_unsure: false,
  created_at: "2026-08-28T00:00:00Z",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createWedding — SSE 스트림 소비", () => {
  it("heartbeat 주석 줄은 무시하고 done 이벤트로 WeddingProfile을 resolve한다", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([": heartbeat\n\n", `event: done\ndata: ${JSON.stringify(MINIMAL_PROFILE)}\n\n`]),
    );

    await expect(createWedding(MINIMAL_INPUT)).resolves.toEqual(MINIMAL_PROFILE);
  });

  it("error 이벤트는 code/message 를 담은 ApiError 로 reject한다", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        `event: error\ndata: ${JSON.stringify({ code: "WEDDING_ALREADY_EXISTS", message: "이미 존재합니다." })}\n\n`,
      ]),
    );

    await expect(createWedding(MINIMAL_INPUT)).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.code === "WEDDING_ALREADY_EXISTS",
    );
  });

  it("스트림 시작 전 422 는 평범한 JSON 에러 응답으로 처리한다", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." } }), {
        status: 422,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(createWedding(MINIMAL_INPUT)).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.code === "VALIDATION_ERROR" && e.status === 422,
    );
  });

  it("네트워크 실패는 NETWORK_ERROR ApiError 로 감싼다", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(createWedding(MINIMAL_INPUT)).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.code === "NETWORK_ERROR",
    );
  });

  it("PERSONALIZATION_TIMEOUT_MS 로 자체 타임아웃을 건다", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(sseResponse([`event: done\ndata: ${JSON.stringify(MINIMAL_PROFILE)}\n\n`]));

    await createWedding(MINIMAL_INPUT);

    expect(timeoutSpy).toHaveBeenCalledWith(PERSONALIZATION_TIMEOUT_MS);
    timeoutSpy.mockRestore();
  });
});
