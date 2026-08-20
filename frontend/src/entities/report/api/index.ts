// report 요청 함수. 응답 타입은 unknown 유지 — 백엔드 계약 확정 전에 지어내지 않는다.
import { http } from "@/shared/api";

export function getLatestReport(userId: string) {
  return http.get<unknown>(`/api/v1/users/${userId}/reports/latest`);
}

export function listReports(userId: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString() ? `?${params.toString()}` : "";
  return http.get<unknown>(`/api/v1/users/${userId}/reports${query}`);
}
