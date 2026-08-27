import { apiBase, apiFetch, classifyFetchFailure, notifyUnauthorized, PERSONALIZATION_TIMEOUT_MS } from "@/shared/api";
import { ApiError, parseApiError } from "@/shared/api/errors";
import type {
  CategoriesResponse,
  TotalAverageBenchmark,
  WeddingCategoriesResponse,
  WeddingCategoryUpdateInput,
  WeddingCreateInput,
  WeddingProfile,
  WeddingUpdateInput,
} from "../model/types";

// updateMyWedding·putWeddingCategories 는 개인화 라우터 에이전트를 동기로 기다린다(백엔드
// `run_personalization()`) — 기본 타임아웃(15초)보다 긴 PERSONALIZATION_TIMEOUT_MS 를 쓴다.
// createWedding은 아래에서 별도로 스트림을 소비하며 같은 상수를 자체 타임아웃으로 쓴다.
//
// createWedding의 input.categories(2026-08-27 추가)는 온보딩이 고른 카테고리 활성/예산 배분을
// 생성과 함께 실어 보낸다 — 이걸로 백엔드가 처음부터 정확한 활성 집합으로 개인화 LLM 생성을
// 한 번만 태운다(이전엔 생성 직후 putWeddingCategories를 또 호출해서 활성 카테고리가 바뀔 때마다
// 개인화가 두 번 트리거됐다). 이 계약은 backend 쪽 구현이 아직 이 필드를 받도록 바뀌지 않았다면
// 동작하지 않는다 — OnboardingPage.tsx와 함께 배포해야 한다.
//
// **SSE 스트림으로 전환(2026-08-28)** — 응답이 JSON 한 덩어리 → `text/event-stream`으로 바뀌었다
// (HTTP 상태코드는 이제 거의 항상 200이고, 성패는 이벤트 종류로만 구분된다). 개인화 LLM 생성이
// 오래 걸릴 때 백엔드가 15초마다 `: heartbeat`(SSE 주석 줄, event/data 없음)를 흘려보내 프록시
// 타임아웃을 피한다 — chat.ts::sendChatMessage와 같은 이유로 apiFetch를 안 태우고 fetch+
// ReadableStream을 직접 읽는다(apiFetch는 응답을 JSON 한 덩어리로 가정한다). 422(요청 바디
// 검증 실패)는 스트림 시작 전에 나므로 그대로 평범한 JSON 에러 응답이다.
function parseWeddingCreateFrame(
  frame: string,
): { type: "done"; data: WeddingProfile } | { type: "error"; data: { code: string; message: string } } | null {
  const lines = frame.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLine = lines.find((line) => line.startsWith("data:"));
  // heartbeat 주석 줄(`: heartbeat`)은 event/data 가 없어 여기서 자동으로 무시된다.
  if (!eventLine || !dataLine) return null;

  const eventType = eventLine.slice("event:".length).trim();
  const data: unknown = JSON.parse(dataLine.slice("data:".length).trim());

  if (eventType === "done") return { type: "done", data: data as WeddingProfile };
  if (eventType === "error") return { type: "error", data: data as { code: string; message: string } };
  return null;
}

export async function createWedding(input: WeddingCreateInput): Promise<WeddingProfile> {
  const url = `${apiBase()}/api/v1/weddings`;
  const timeoutSignal = AbortSignal.timeout(PERSONALIZATION_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: timeoutSignal,
    });
  } catch (cause) {
    throw classifyFetchFailure(cause, timeoutSignal, {
      method: "POST",
      url,
      timeoutMs: PERSONALIZATION_TIMEOUT_MS,
    });
  }

  if (!res.ok || !res.body) {
    const body: unknown = await res.json().catch(() => null);
    const error = parseApiError(res.status, body);
    // 이 엔드포인트는 apiFetch 를 안 태우므로(스트림 응답이라 위 머리말 참고), 공용 401 무효화
    // 경로도 스스로 태워야 한다(sendChatMessage 와 동일 이유).
    notifyUnauthorized(error);
    throw error;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    let streamDone = false;
    while (!streamDone) {
      // 스트림 청크는 순서가 있고 이전 read() 결과(버퍼)에 의존한다 — Promise.all 로 병렬화 불가.
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      streamDone = done;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const parsed = parseWeddingCreateFrame(frame);
        if (parsed?.type === "done") return parsed.data;
        if (parsed?.type === "error") {
          const error = new ApiError({ code: parsed.data.code, message: parsed.data.message, status: 200, extra: {} });
          notifyUnauthorized(error);
          throw error;
        }
      }
    }
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw classifyFetchFailure(cause, timeoutSignal, {
      method: "POST",
      url,
      timeoutMs: PERSONALIZATION_TIMEOUT_MS,
    });
  }

  throw new ApiError({
    code: "UNKNOWN_ERROR",
    message: "서버 응답을 해석할 수 없습니다.",
    status: 0,
    extra: {},
  });
}

export function getMyWedding(): Promise<WeddingProfile> {
  return apiFetch("/api/v1/weddings/me") as Promise<WeddingProfile>;
}

export function updateMyWedding(input: WeddingUpdateInput): Promise<WeddingProfile> {
  return apiFetch(
    "/api/v1/weddings/me",
    { method: "PATCH", body: JSON.stringify(input) },
    PERSONALIZATION_TIMEOUT_MS,
  ) as Promise<WeddingProfile>;
}

export function getWeddingCategories(): Promise<WeddingCategoriesResponse> {
  return apiFetch("/api/v1/wedding-categories") as Promise<WeddingCategoriesResponse>;
}

// 2026-08-27부터 온보딩(OnboardingPage.tsx)은 이 함수를 더 이상 호출하지 않는다 — 카테고리
// 활성/배분은 createWedding의 categories 필드로 생성 시점에 함께 들어간다. 이 함수는 온보딩
// 이후 수정(예산 페이지의 카테고리 재배분 등, BudgetPage.tsx)에만 쓰인다.
export function putWeddingCategories(categories: WeddingCategoryUpdateInput[]): Promise<WeddingCategoriesResponse> {
  return apiFetch(
    "/api/v1/wedding-categories",
    { method: "PUT", body: JSON.stringify({ categories }) },
    PERSONALIZATION_TIMEOUT_MS,
  ) as Promise<WeddingCategoriesResponse>;
}

// 온보딩 예산 단계 전용(#6 호출 전, 웨딩 미존재) — API 스펙 §8.
export function getTotalAverageBenchmark(regionCode: string): Promise<TotalAverageBenchmark> {
  return apiFetch(
    `/api/v1/benchmarks/total-average?region_code=${encodeURIComponent(regionCode)}`,
  ) as Promise<TotalAverageBenchmark>;
}

// #11 — 웨딩과 무관한 전역 상수. 온보딩 6단계가 배분 행 목록·순서·"비용 없음" 판단을 여기서 얻는다.
export function getCategories(): Promise<CategoriesResponse> {
  return apiFetch("/api/v1/categories") as Promise<CategoriesResponse>;
}
