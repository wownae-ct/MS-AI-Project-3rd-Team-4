// auth 6종. 응답을 도메인 타입으로 좁히는 곳도 여기다 — apiFetch 는 unknown 을 준다.
//
// 🚨 login · signup · logout 이 성공하면 상태가 바뀐다 — 호출부가 반드시 `invalidateSession()`
//    을 이어서 불러야 한다(예: LoginPage). 여기서 부르지 않는 이유는 `model/session-cache.ts`
//    가 `getMe` 를 얻으려 이미 이 파일을 import 하고 있어서다 — 반대 방향으로 또 import 하면
//    순환 참조가 되고, 실제로 `import/no-cycle` 이 이를 잡아 lint 를 깬다(빌드 게이트가 우회를
//    허용하지 않는다). 그래서 무효화 호출은 이 파일이 아니라 화면 쪽 몫이다.
import { ApiError, apiBase, apiFetch } from "@/shared/api";
import type { AuthUser } from "../model/types";

function toAuthUser(raw: unknown): AuthUser {
  const r = raw as Record<string, unknown>;
  if (typeof r?.id !== "string" || typeof r.email !== "string") {
    // 형식 밖 응답을 조용히 통과시키지 않는다 — id·email 이 문자열이 아니면 `String(undefined)`
    // 가 리터럴 "undefined" 를 만들어 유효해 보이는 AuthUser 를 지어낸다(값 지어내기 금지).
    // HTTP 는 이미 2xx 였으므로 이건 전송 실패가 아니라 응답 "형식" 위반이다 — status 는 0.
    throw new ApiError({
      code: "MALFORMED_USER",
      message: "서버가 돌려준 사용자 정보의 형식이 예상과 다릅니다.",
      status: 0,
      extra: {},
    });
  }
  return {
    id: r.id,
    email: r.email,
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
 *
 * `redirectTo` 는 콜백 성공 후 돌아올 앱 내부 경로다(dev-35 확정 계약, GET
 * /auth/{provider}/login?redirect_to=...) — 안 넘기면 백엔드가 루트로 보낸다(하위호환).
 * 실제 검증(앱 내부 상대경로만 허용, `//`·`://` 거부)은 백엔드 책임이다 — 여기서는 값을
 * 그대로 실어 보내기만 한다.
 */
export function socialLoginUrl(provider: "google" | "naver", redirectTo?: string): string {
  const base = `${apiBase()}/api/v1/auth/${provider}/login`;
  if (!redirectTo) return base;
  return `${base}?redirect_to=${encodeURIComponent(redirectTo)}`;
}
