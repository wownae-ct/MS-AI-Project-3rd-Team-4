// backend/app/gateway/routers/reports.py 대응
import { http } from "./client";

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
