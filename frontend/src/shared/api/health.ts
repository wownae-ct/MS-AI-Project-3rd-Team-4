// backend/app/gateway/routers/health.py 대응 (/api/v1 프리픽스 없음 — 백엔드와 동일)
import { http } from "./client";

export function checkHealth() {
  return http.get<{ status: string }>("/healthz");
}
