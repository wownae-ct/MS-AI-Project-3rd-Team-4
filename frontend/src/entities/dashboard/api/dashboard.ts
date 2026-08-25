import { apiFetch } from "@/shared/api";
import type { DashboardSummary, MyReport } from "../model";

export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch("/api/v1/dashboard/summary") as Promise<DashboardSummary>;
}

export function getMyReport(): Promise<MyReport> {
  return apiFetch("/api/v1/reports/me") as Promise<MyReport>;
}
