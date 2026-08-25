// 🚨 beforeLoad 는 캐시되지 않는다. TanStack Router 내부 문서 원문
//    (packages/router-core/INTERNALS.md):
//    "The beforeLoad context is **not a cache** ... A subsequent navigation rebuilds merged
//     context from the parent and reruns beforeLoad, even when reusing completed loader data."
//    → 가드에서 getMe() 를 그냥 부르면 **탭을 옮길 때마다** GET /auth/me 왕복이 붙는다.
//      로컬에서는 수 ms 라 안 보이고 배포에서만 드러난다.
//
// loader 로 옮기는 것으로는 해결되지 않는다 — 리다이렉트 판정은 자식 로더가 돌기 **전에**
// 끝나야 하므로 beforeLoad 에 있어야 한다. 그래서 조회 쪽에 캐시를 씌운다.
import { getMe } from "../api/auth";
import type { AuthUser } from "./types";

/** 세션 수명은 30일이지만, 다른 탭에서 로그아웃한 경우가 이 창만큼 늦게 반영된다. */
const TTL_MS = 60_000;

let cached: { user: AuthUser; at: number } | null = null;

export async function loadSession(): Promise<AuthUser> {
  if (cached !== null && Date.now() - cached.at < TTL_MS) return cached.user;
  const user = await getMe();
  // **성공만 캐시한다.** 실패를 캐시하면 로그인 직후에도 TTL 동안 튕긴다.
  // 실패 시 재조회는 낭비가 아니다 — 곧바로 /login 으로 가고 거기엔 가드가 없다.
  cached = { user, at: Date.now() };
  return user;
}

export function invalidateSession(): void {
  cached = null;
}
