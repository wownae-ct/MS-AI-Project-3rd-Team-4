/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // 지원 매트릭스(정책 상속) — Chromium 111 하한 명시 배열.
    // Vite 기본값('baseline-widely-available')은 Firefox·Safari 포함이라 위임 금지.
    target: ["chrome111", "edge111"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
    // old/는 브리프코치 피벗 전 레거시 보존 — 활성 테스트 대상이 아니다.
    exclude: ["**/node_modules/**", "**/dist/**", "old/**"],
  },
});
