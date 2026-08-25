// 전송 계층 — 앱에서 fetch 를 직접 부르는 곳은 여기뿐이다.
import { apiBase } from "./env";
import { ApiError, parseApiError } from "./errors";

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

async function send(path: string, init: RequestInit): Promise<unknown> {
  // apiBase() 를 try 밖에서 부른다. 안에 두면 VITE_API_BASE 형식 위반으로 던지는
  // ApiError(API_BASE_INVALID) 가 같은 catch 에 잡혀 NETWORK_ERROR 로 재포장된다 —
  // 설정 오류가 "네트워크를 확인하라"는 오진으로 둔갑한다(client.test.ts 가 고정한다).
  const url = `${apiBase()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    // 네트워크 실패를 그대로 흘리면 화면이 ApiError 와 TypeError 두 종류를 다뤄야 한다.
    // 한 종류로 모으고 code 로 구분한다.
    throw new ApiError({
      code: "NETWORK_ERROR",
      message: "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
      status: 0,
      extra: { cause: String(cause) },
    });
  }

  const body = await readBody(response);
  if (!response.ok) {
    const error = parseApiError(response.status, body);
    // 세션이 사용 중 만료되면(슬라이딩 갱신이 없어 30일째 반드시 온다) 캐시된 세션이
    // 거짓을 말한다. 여기서 알리고, 무효화는 구독자가 한다.
    if (error.code === "UNAUTHORIZED") {
      for (const handler of unauthorizedHandlers) {
        try {
          handler();
        } catch {
          // 구독자 쪽 버그를 여기서 삼킨다 — 원본 UNAUTHORIZED ApiError 는 이 블록 밖에서
          // 그대로 throw 되므로 호출자 입장에서는 조용하지 않다. 삼키지 않으면 한 구독자의
          // 실패가 나머지 구독자 호출과 원본 에러 전파를 함께 막는다(Set.forEach 는 콜백이
          // 던지면 그 지점에서 중단된다).
        }
      }
    }
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
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  return send(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    credentials: "include",
  });
}

/**
 * 멀티파트 요청. **`apiFetch` 를 태우지 않는다** — `FormData` 는 브라우저가 boundary 를 포함한
 * Content-Type 을 자동 설정해야 하므로 JSON 래퍼를 거치면 깨진다(layers.md 부록 A 가 "의도된 설계"로 명시).
 */
export function apiFetchMultipart(path: string, form: FormData, init: RequestInit = {}): Promise<unknown> {
  return send(path, { method: "POST", ...init, body: form, credentials: "include" });
}
