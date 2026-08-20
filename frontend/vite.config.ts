/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // tsconfig.app.json의 paths("@/*")를 그대로 쓴다 — 별칭 정의를 두 곳에 두지 않기 위해서다.
    // 수동 alias는 절대 경로가 필요해 node:url 의존을 부르는데, 그 대가를 치를 이유가 없다.
    tsconfigPaths: true,
  },
  build: {
    // 지원 매트릭스(정책 상속) — Chromium 111 하한 명시 배열.
    // Vite 기본값('baseline-widely-available')은 Firefox·Safari 포함이라 위임 금지.
    target: ["chrome111", "edge111"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
