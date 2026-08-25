/** 로그인한 사용자. 전송 형식(snake_case)을 화면까지 끌고 가지 않는다. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  /**
   * 온보딩 완료 여부.
   *
   * 🚨 **`signup` 응답의 값은 신뢰할 수 없다** — 백엔드가 항상 false 를 하드코딩한다.
   * 실제 값은 `login` · `me` 에서만 온다. api/auth.ts 가 signup 쪽을 false 로 강제한다.
   */
  hasWedding: boolean;
}
