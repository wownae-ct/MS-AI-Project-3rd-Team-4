// backend/app/gateway/routers/health.py 대응 (/api/v1 프리픽스 없음 — 백엔드와 동일)
import { http } from "./client";

export function checkHealth() {
  // 응답 타입은 백엔드 Pydantic 확정 전 unknown 유지 (§0 — 타입을 지어내지 않는다)
  return http.get<unknown>("/healthz");
}
