// FSD 경계 규칙 — oxlint에 레이어 경계 규칙이 없어(oxc#13789) dependency-cruiser가 강제한다.
// 로컬: npm run depcruise
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "순환 의존 금지 — FSD 하향 규칙의 전제 (dependency-cruiser 공식 권장 기본 규칙)",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-cross-feature",
      comment: "features 상호 import 금지 — feature 간 조립은 app/pages 담당",
      severity: "error",
      from: { path: "^src/features/([^/]+)/" },
      to: { path: "^src/features/", pathNot: "^src/features/$1/" },
    },
    {
      name: "no-upward-import-shared",
      comment: "shared는 최하층 — 상위 레이어 import 금지",
      severity: "error",
      from: { path: "^src/shared/" },
      to: { path: "^src/(app|pages|features|entities)/" },
    },
    {
      name: "no-upward-import-entities",
      severity: "error",
      from: { path: "^src/entities/" },
      to: { path: "^src/(app|pages|features)/" },
    },
    {
      name: "no-upward-import-features",
      severity: "error",
      from: { path: "^src/features/" },
      to: { path: "^src/(app|pages)/" },
    },
    {
      name: "no-upward-import-pages",
      severity: "error",
      from: { path: "^src/pages/" },
      to: { path: "^src/app/" },
    },
    {
      name: "no-same-layer-slice-import",
      comment: "같은 레이어의 다른 슬라이스 import 금지 (FSD 공식 규칙)",
      severity: "error",
      from: { path: "^src/(entities|pages)/([^/]+)/" },
      to: { path: "^src/$1/", pathNot: "^src/$1/$2/" },
    },
    {
      name: "no-slice-internals-from-outside",
      comment: "슬라이스 밖에서는 슬라이스 루트 index.ts public API만 — 심층 index.ts는 우회로가 아니다",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/(features|entities|pages)/" },
      to: { path: "^src/(features|entities|pages)/[^/]+/.+", pathNot: "^src/(features|entities|pages)/[^/]+/index\\.ts$" },
    },
    {
      name: "no-slice-internals-cross-slice",
      comment: "다른 슬라이스의 내부 파일 직접 import 금지 — 자기 슬라이스 내부는 허용",
      severity: "error",
      from: { path: "^src/(features|entities|pages)/([^/]+)/" },
      to: {
        path: "^src/(features|entities|pages)/[^/]+/.+",
        pathNot: ["^src/(features|entities|pages)/[^/]+/index\\.ts$", "^src/$1/$2/"],
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.app.json" },
    // import type도 검사 — 미설정 시 type-only 상향·교차 import가 컴파일 후 소거되어 전 규칙을 통과한다
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default"] },
  },
};
