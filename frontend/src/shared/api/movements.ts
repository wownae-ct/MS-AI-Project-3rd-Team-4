// backend/app/gateway/routers/movements.py 대응
import { http } from "./client";

export function listMovements() {
  return http.get<unknown>("/api/v1/movements");
}

// T1 클라이언트 룰엔진이 부팅 시 로드하는 핵심 엔드포인트
export function getMovementRules(code: string) {
  return http.get<unknown>(`/api/v1/movements/${code}/rules`);
}

export function getCuesManifest() {
  return http.get<unknown>("/api/v1/cues/manifest");
}
