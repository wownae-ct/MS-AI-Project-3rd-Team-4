// 공용 fetch 래퍼 — 전송 계층. 도메인을 모른다 (docs/architecture/layers.md §2.1).
// VITE_API_BASE는 빌드타임에 정적 치환된다. 값 규격·주입 경로는 docs/architecture/toolchain.md §6.

import { API_BASE } from "@/shared/config";

// 호출부 편의를 위해 다시 노출한다. 선언 자체는 shared/config/env.ts 한 곳에만 있다.
export { API_BASE };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    // headers는 반드시 ...init "뒤에" 온다. 앞에 두면 init.headers가 병합 결과를 통째로
    // 덮어써 Content-Type 기본값이 사라진다(호출자가 헤더를 넘기는 순간 415). 순서를 되돌리지 말 것.
    // 회귀 테스트: client.test.ts 「헤더 병합」
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const http = {
  /**
   * 이스케이프 해치 — 커스텀 헤더·메서드가 필요할 때만 쓴다.
   * 공개해 두는 이유: 헤더 병합 경로가 테스트로 고정되어야 하기 때문이다(client.test.ts).
   * multipart는 이 래퍼를 쓰지 않는다 — 브라우저가 boundary 포함 Content-Type을 직접 정해야 한다.
   */
  request: <T>(path: string, init?: RequestInit) => request<T>(path, init),
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
};
