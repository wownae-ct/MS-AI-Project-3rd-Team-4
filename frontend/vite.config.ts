/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * 프로덕션 빌드가 개발 시맨틱으로 도는 것을 막는다.
 *
 * 왜 필요한가 — Vite 는 envDir(기본값: 프로젝트 루트) 의 .env 에서 NODE_ENV 를 읽고,
 * 그 값이 isProduction 을 결정한다. MODE(--mode)와 PROD/DEV(NODE_ENV)는 공식 문서상
 * "독립적인 개념"이라, .env 에 NODE_ENV=development 한 줄이 있으면
 * `vite build` 가 MODE=production 이면서 DEV=true 인 모순 상태로 돈다.
 *
 * 그 상태의 실측 결과(2026-08-20, 이 저장소에서 실제로 발생했다):
 *   - @vitejs/plugin-react 가 개발용 JSX 트랜스폼을 써서 jsxDEV 디버그 메타데이터가 들어간다
 *   - 소스 파일의 개발자 PC 절대 경로가 배포 번들에 박힌다
 *   - import.meta.env.DEV 가 true 라 DEV 전용으로 작성한 코드가 프로덕션에서 실행된다
 *   - 번들이 199 kB → 398 kB 로 부푼다
 * 무엇보다 조용하다. 빌드는 성공하고 경고도 없다.
 *
 * .env 는 .gitignore 대상이라 사람마다 파일이 다르다. 원인을 한 번 고쳐도
 * 다른 환경에서 재발할 수 있어, 원인이 무엇이든 잡는 게이트를 여기 둔다.
 *
 * mode 를 함께 보는 이유 — `--mode staging` + NODE_ENV=production 같은 정당한 조합을
 * 막지 않기 위해서다. 두 개념이 독립이므로 모드만으로 단정하지 않는다.
 */
function assertProductionBuild(): Plugin {
  return {
    name: "assert-production-build",
    apply: "build",
    configResolved(config) {
      if (config.mode === "production" && !config.isProduction) {
        throw new Error(
          [
            "프로덕션 빌드인데 isProduction=false 다 (NODE_ENV 가 development 로 잡혔다).",
            "",
            `  mode=${config.mode}  isProduction=${String(config.isProduction)}  envDir=${config.envDir}`,
            "",
            "원인: envDir 안의 .env 계열 파일에 NODE_ENV 가 들어 있다.",
            "조치: 그 줄을 지운다. NODE_ENV 는 Vite 가 모드에 따라 스스로 정하는 값이라",
            "      프론트 앱의 .env 에 손으로 넣을 이유가 없다.",
            "",
            "이대로 두면 개발용 JSX 트랜스폼과 소스 절대 경로가 배포 번들에 들어가고,",
            "import.meta.env.DEV 로 감싼 개발 전용 코드가 프로덕션에서 실행된다.",
          ].join("\n"),
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    // optimize: false — lightningcss 를 두 번 돌리지 않기 위해서다 (ADR 0003 §결정 4).
    //
    // Vite 8 은 build.cssMinify 기본값이 lightningcss 이고, build.cssTarget(기본값 = build.target)이
    // css.lightningcss.targets 보다 우선한다. Tailwind 의 vite 플러그인도 자체 lightningcss 로 최적화하는데,
    // 그쪽은 Tailwind 자신의 하한(Chrome 111 / Safari 16.4 / Firefox 128)을 쓴다.
    // 그대로 두면 다운레벨 타깃이 두 곳으로 갈린다 — 이 저장소가 별칭·Node 버전에서 거부해 온 패턴이다.
    // Tailwind 쪽을 끄면 타깃의 단일 출처가 아래 build.target 하나로 유지된다.
    tailwindcss({ optimize: false }),
    assertProductionBuild(),
  ],
  resolve: {
    // tsconfig.app.json의 paths("@/*")를 그대로 쓴다 — 별칭 정의를 두 곳에 두지 않기 위해서다.
    // 수동 alias는 절대 경로가 필요해 node:url 의존을 부르는데, 그 대가를 치를 이유가 없다.
    tsconfigPaths: true,
  },
  build: {
    // 지원 매트릭스 — Chromium 111 하한 명시 배열.
    // Vite 기본값('baseline-widely-available')은 타깃이 암묵적으로 바뀌므로 위임하지 않는다.
    //
    // ⚠️ 이 값은 **이전 주제에서 상속된 것이고 현재 제품 기준으로 재검토되지 않았다.**
    //    Safari 를 뺀 근거가 지금은 남아 있지 않다 — 지원 범위 결정은 화면 스펙과 함께 확정한다.
    //    포함하기로 하면 "safari16.4" 를 더한다(Tailwind v4 의 하한과 정확히 일치).
    //    그때 입력 필드 16px 규칙(shared/ui/README.md)이 선택이 아니라 필수가 된다.
    target: ["chrome111", "edge111"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
