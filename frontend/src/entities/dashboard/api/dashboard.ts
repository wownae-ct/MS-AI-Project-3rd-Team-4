import { ApiError, apiFetch } from "@/shared/api";
import type { DashboardSummary, MyReport } from "../model";

// 최소 구조 검증 — 필드 전부를 깊게 검증하지 않고, 화면이 바로 읽는 최상위 필드의 존재/타입만
// 본다. 이게 없으면 예상과 다른 200 응답이 렌더 도중 TypeError 를 내 페이지 전용 에러 대신
// 앱 전역 ErrorBoundary 로 튕겨 나갔다(레드팀 감사).
function isDashboardSummary(value: unknown): value is DashboardSummary {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.wedding_date === "string" &&
    typeof v.d_day === "number" &&
    typeof v.total_budget === "number" &&
    typeof v.total_paid === "number" &&
    typeof v.total_planned === "number" &&
    typeof v.remaining_budget === "number" &&
    Array.isArray(v.categories) &&
    Array.isArray(v.upcoming_items) &&
    (v.budget_benchmark === null || typeof v.budget_benchmark === "object")
  );
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const body = await apiFetch("/api/v1/dashboard/summary");
  if (!isDashboardSummary(body)) {
    throw new ApiError({
      code: "UNEXPECTED_RESPONSE_SHAPE",
      message: "대시보드 응답 형식이 예상과 달라 불러오지 못했습니다.",
      status: 200,
      extra: {},
    });
  }
  return body;
}

export function getMyReport(): Promise<MyReport> {
  return apiFetch("/api/v1/reports/me") as Promise<MyReport>;
}
