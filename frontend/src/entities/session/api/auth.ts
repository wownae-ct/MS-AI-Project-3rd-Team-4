// auth 6종. 응답을 도메인 타입으로 좁히는 곳도 여기다 — apiFetch 는 unknown 을 준다.
//
// 🚨 login · signup · logout 이 성공하면 상태가 바뀐다 — 호출부가 반드시 `invalidateSession()`
//    을 이어서 불러야 한다(예: LoginPage). 여기서 부르지 않는 이유는 `model/session-cache.ts`
//    가 `getMe` 를 얻으려 이미 이 파일을 import 하고 있어서다 — 반대 방향으로 또 import 하면
//    순환 참조가 되고, 실제로 `import/no-cycle` 이 이를 잡아 lint 를 깬다(빌드 게이트가 우회를
//    허용하지 않는다). 그래서 무효화 호출은 이 파일이 아니라 화면 쪽 몫이다.
import { apiBase, apiFetch } from "@/shared/api";
import type { AuthUser } from "../model/types";

function toAuthUser(raw: unknown): AuthUser {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id),
    email: String(r.email),
    displayName: typeof r.display_name === "string" ? r.display_name : null,
    hasWedding: r.has_wedding === true,
  };
}

export async function signup(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<AuthUser> {
  const raw = await apiFetch("/api/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      display_name: input.displayName,
    }),
  });
  // 🚨 signup 응답의 has_wedding 은 항상 false 하드코딩이라 값이 의미 없다.
  //    "혹시 true 면 홈으로" 같은 분기를 만들지 못하게 여기서 false 로 못 박는다.
  return { ...toAuthUser(raw), hasWedding: false };
}

export async function login(input: { email: string; password: string }): Promise<AuthUser> {
  const raw = await apiFetch("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
  return toAuthUser(raw);
}

export async function logout(): Promise<void> {
  await apiFetch("/api/v1/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<AuthUser> {
  return toAuthUser(await apiFetch("/api/v1/auth/me"));
}

/**
 * 🚨 소셜 로그인은 `fetch` 로 부르면 안 된다 — 307 리다이렉트 + 쿠키 설정이라 XHR 로는
 * 성립하지 않는다. 반환된 URL 로 `window.location.href` 를 바꾼다.
 *
 * 지원 제공자는 구글·네이버 2종뿐이다(카카오는 백엔드에 없다).
 */
export function socialLoginUrl(provider: "google" | "naver"): string {
  return `${apiBase()}/api/v1/auth/${provider}/login`;
}
