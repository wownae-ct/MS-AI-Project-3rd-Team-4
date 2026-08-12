// backend/app/gateway/routers/profile.py 대응
import { http } from "./client";

export function updateProfile(body: unknown) {
  return http.put<unknown>("/api/v1/profile", body);
}

export function addInjury(body: unknown) {
  return http.post<unknown>("/api/v1/profile/injuries", body);
}
