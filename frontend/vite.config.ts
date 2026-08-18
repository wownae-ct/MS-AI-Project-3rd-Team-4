/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // 설계서 §6.3 지원 매트릭스 SSOT — Chromium 111 하한 명시 배열.
    // Vite 기본값('baseline-widely-available')은 Firefox·Safari 포함이라 위임 금지.
    // 하한 변경은 분기별 StatCounter 실측으로만 (§6.3).
    target: ["chrome111", "edge111"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
  },
});
