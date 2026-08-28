// 전송 계층 — 앱에서 fetch 를 직접 부르는 곳은 여기뿐이다.
import { apiBase } from "./env";
import { ApiError, parseApiError } from "./errors";

// 요청 하나가 이 시간 안에 응답하지 않으면 스스로 끊는다 — 이전엔 타임아웃이 전혀 없어 서버가
// 멈추면(예: 개인화 LangGraph 동기 대기) 화면이 취소 수단 없이 무한정 막혔다(레드팀 감사).
const DEFAULT_TIMEOUT_MS = 15_000;

// 개인화 라우터 에이전트(route→generate→validate)를 동기로 기다리는 엔드포인트 전용 — 실사용 중
// 확인된 버그(2026-08-26): LLM 생성이 15초를 넘기면 백엔드는 계속 처리해 결국 성공하는데 클라이언트만
// 먼저 TIMEOUT 으로 포기해 버렸다. 화면엔 "다시 시도해 주세요"가 뜨지만 재시도는 이미 만들어진
// 자원과 충돌해 409(WEDDING_ALREADY_EXISTS)로 막힌다 — 재시도 성공 여부가 타이밍 도박이 된다.
// `POST /weddings`·`PATCH /weddings/me`·`PUT /wedding-categories`·`POST /personalization/regenerate`
// 가 모두 이 그래프를 동기로 태운다(CLAUDE.md "Personalization" 절) — 이 넷만 기본값보다 길게 준다.
//
// 45초→60초 상향(2026-08-27): Langfuse "MerryMap" 대시보드의 "응답 시간 p95(트레이스별)" 위젯
// 실측 — personalization 트레이스 p95가 45.9초로, 기존 45초 타임아웃과 사실상 같은 선이라 상위
// 5%+ 가 이미 이 값 근처에서 타임아웃나고 있었다(이번 온보딩 카테고리 유실 버그의 근본 원인,
// docs/AI-Sessions/wiki/errors/2026-08-27-onboarding-category-loss-on-createWedding-timeout.md).
// 인프라 쪽 ingress proxy-read/send-timeout은 이미 120초(2026-08-26, 챗 SSE 타임아웃 3중 방지
// 커밋 154e352 — /api 전체에 적용되는 값이라 개인화 엔드포인트에도 이미 여유가 있었다)라 60초는
// 안전하게 그 안에 들어간다. 100초까지는 필요 없다고 판단 — 온보딩이 이제 개인화 LLM 호출을
// 한 번만 태우도록 바뀌어서(OnboardingPage.tsx, categories를 createWedding에 함께 보냄) 예전처럼
// 두 호출이 겹쳐 최악 90초(45×2)까지 갈 위험 자체가 없어졌다.
export const PERSONALIZATION_TIMEOUT_MS = 60_000;

// 영수증 OCR(POST /payments/receipt-extract) 전용 — 트러블슈팅 STEP 1-C(2026-08-26). 백엔드가
// Blob 업로드 + vision 호출을 순차로 하는데, 사진 용량이 크거나 모델 응답이 느리면(vision 모델
// 특성상 20~30초는 드물지 않음) 기본 15초보다 오래 걸려 정상적으로 성공했을 요청이 프론트에서
// 먼저 끊겼다. 백엔드 azure_openai_timeout_seconds 기본값(45초)과 맞춘다.
export const RECEIPT_OCR_TIMEOUT_MS = 45_000;

// 401 구독 — shared 는 최하층이라 entities/session 을 import 할 수 없다(oxlint 가 막는다).
// 그래서 방향을 뒤집는다: shared 는 「누군가 듣는다」만 알고, 배선은 app 레이어가 한다.
const unauthorizedHandlers = new Set<() => void>();

/** 401 을 받을 때마다 호출된다. 반환값은 해제 함수다 — 구독이 누적되면 같은 무효화가 여러 번 돈다. */
export function onUnauthorized(handler: () => void): () => void {
  unauthorizedHandlers.add(handler);
  return () => {
    unauthorizedHandlers.delete(handler);
  };
}

/**
 * UNAUTHORIZED 구독자 전원을 부른다. `send()` 내부에서 쓰지만, apiFetch/apiFetchMultipart 를
 * 태우지 않는 호출부(예: SSE 스트림을 직접 읽는 `sendChatMessage`)도 자기 응답을 스스로 해석한
 * 뒤 이 함수로 같은 무효화 경로를 태울 수 있게 export 한다 — 안 그러면 그 경로만 401 이 와도
 * 앱 전역 세션 무효화가 트리거되지 않는다(레드팀 감사).
 */
export function notifyUnauthorized(error: ApiError): void {
  if (error.code !== "UNAUTHORIZED") return;
  for (const handler of unauthorizedHandlers) {
    try {
      handler();
    } catch (cause) {
      // 구독자 쪽 버그를 여기서 삼킨다 — 원본 UNAUTHORIZED ApiError 는 이 함수 밖에서
      // 그대로 throw 되므로 호출자 입장에서는 조용하지 않다. 삼키지 않으면 한 구독자의
      // 실패가 나머지 구독자 호출과 원본 에러 전파를 함께 막는다(Set.forEach 는 콜백이
      // 던지면 그 지점에서 중단된다). 다만 삼킨 실패 자체는 흔적을 남긴다 — 안 남기면
      // 유일한 구독자(invalidateSession)가 깨져도 아무도 모른다(로깅 관측성 감사, 2026-08-26).
      console.error("[client] onUnauthorized 구독자 실패:", cause);
    }
  }
}

function isTimeoutAbort(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason instanceof DOMException && signal.reason.name === "TimeoutError";
}

/** 호출자가 자기 AbortSignal 을 줬으면 그 신호 + 타임아웃을 합성하고, 안 줬으면 타임아웃만 건다. */
function withTimeout(callerSignal: AbortSignal | null | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
}

/**
 * fetch() 자체가 던진(=응답조차 못 받은) 실패를 TIMEOUT/NETWORK_ERROR ApiError 로 분류한다.
 * `send()` 전용이었으나, `apiFetch` 를 안 태우고 fetch+ReadableStream 을 직접 쓰는 SSE
 * 소비부(`entities/wedding/api/wedding.ts::createWedding` 등)도 같은 분류가 필요해 공유한다
 * — 분류 기준과 로그 포맷을 두 곳에 따로 두면 드리프트한다.
 */
export function classifyFetchFailure(
  cause: unknown,
  signal: AbortSignal,
  context: { method: string; url: string; timeoutMs: number },
): ApiError {
  if (isTimeoutAbort(signal)) {
    console.warn(`[client] 타임아웃(${context.timeoutMs}ms): ${context.method} ${context.url}`);
    return new ApiError({
      code: "TIMEOUT",
      message: "요청이 시간 초과되었습니다. 잠시 후 다시 시도해 주세요.",
      status: 0,
      extra: {},
    });
  }
  console.error(`[client] 네트워크 실패: ${context.method} ${context.url}`, cause);
  return new ApiError({
    code: "NETWORK_ERROR",
    message: "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
    status: 0,
    extra: { cause: String(cause) },
  });
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.headers.get("content-length") === "0") return undefined;
  const text = await response.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function send(path: string, init: RequestInit, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  // apiBase() 를 try 밖에서 부른다. 안에 두면 VITE_API_BASE 형식 위반으로 던지는
  // ApiError(API_BASE_INVALID) 가 같은 catch 에 잡혀 NETWORK_ERROR 로 재포장된다 —
  // 설정 오류가 "네트워크를 확인하라"는 오진으로 둔갑한다(client.test.ts 가 고정한다).
  const url = `${apiBase()}${path}`;
  const signal = withTimeout(init.signal, timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal });
  } catch (cause) {
    // 네트워크 실패를 그대로 흘리면 화면이 ApiError 와 TypeError 두 종류를 다뤄야 한다.
    // 한 종류로 모으고 code 로 구분한다. 화면엔 사용자용 메시지만 뜨고 원인은 아무 데도
    // 안 남았었다 — 30개 넘는 호출부 중 콘솔에 남기는 곳이 ErrorBoundary 하나뿐이라
    // 여기 이 한 지점만 고치면 전체가 커버된다(로깅 관측성 감사, 2026-08-26).
    throw classifyFetchFailure(cause, signal, { method: init.method ?? "GET", url, timeoutMs });
  }

  const body = await readBody(response);
  if (!response.ok) {
    const error = parseApiError(response.status, body);
    console.error(`[client] HTTP ${response.status}: ${init.method ?? "GET"} ${url}`, error.code, error.extra);
    // 세션이 사용 중 만료되면(슬라이딩 갱신이 없어 30일째 반드시 온다) 캐시된 세션이
    // 거짓을 말한다. 여기서 알리고, 무효화는 구독자가 한다.
    notifyUnauthorized(error);
    throw error;
  }
  return body;
}

/**
 * JSON 요청. 응답은 **`unknown`** 이다 — 좁히는 것은 슬라이스의 몫이다.
 *
 * ⚠️ `...init` 을 먼저 펼치고 `headers` 를 뒤에 둔다. 순서를 되돌리면 호출자가 헤더를 넘겼을 때
 *    Content-Type 이 통째로 사라진다(layers.md 부록 A — 실제로 났던 버그. client.test.ts 가 고정한다).
 * ⚠️ `credentials` 도 뒤에 둔다. 호출자가 끌 수 없어야 한다 — 빠뜨리면 대부분의 API 가 401 이다.
 *
 * `timeoutMs` 를 생략하면 기본 15초 — 개인화 LangGraph 를 동기로 태우는 호출부는
 * `PERSONALIZATION_TIMEOUT_MS` 를 명시적으로 넘긴다.
 */
export function apiFetch(path: string, init: RequestInit = {}, timeoutMs?: number): Promise<unknown> {
  return send(
    path,
    {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
      credentials: "include",
    },
    timeoutMs,
  );
}

/**
 * 멀티파트 요청. **`apiFetch` 를 태우지 않는다** — `FormData` 는 브라우저가 boundary 를 포함한
 * Content-Type 을 자동 설정해야 하므로 JSON 래퍼를 거치면 깨진다(layers.md 부록 A 가 "의도된 설계"로 명시).
 *
 * `timeoutMs` 를 생략하면 기본 15초 — 영수증 OCR 호출부는 `RECEIPT_OCR_TIMEOUT_MS` 를 명시적으로
 * 넘긴다(트러블슈팅 STEP 1-C).
 */
export function apiFetchMultipart(
  path: string,
  form: FormData,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<unknown> {
  return send(path, { method: "POST", ...init, body: form, credentials: "include" }, timeoutMs);
}
