// 번들 예산 + 디자인 규범 게이트 — `npm run build` 체인의 마지막 단계.
//
// 왜 Vite 플러그인이 아니라 별도 스크립트인가
//   플러그인으로 넣으면 gzip 계산에 node:zlib 타입이 필요해 @types/node 와 tsconfig 프로젝트 분리가
//   딸려온다. tsconfig.app.json 의 types 에 @types/node 를 넣으면 **앱 코드에서도 process·Buffer 가
//   타입 통과**해 조용한 실패 경로가 생긴다. 이 파일은 tsconfig.app.json 의 include 밖이라
//   그 문제가 통째로 사라지고, dist 를 디스크에서 읽으므로 **실제 배포되는 바이트**를 잰다.
//   package.json 의 && 체인이라 건너뛸 수 없고 CI 워크플로 수정도 불필요하다.
//
// 왜 폰트를 따로 세는가
//   Wanted Sans 는 unicode-range 로 92조각 분할돼 있어 **전량 전송되지 않는다.** 합계로 재면
//   폰트가 예산을 다 먹어 정작 감시해야 할 JS·유틸리티 CSS 증가를 감지하지 못한다.
//   같은 이유로 CSS 는 @font-face 블록을 빼고 잰다 — 화면이 늘어도 그 부분은 그대로다.
//
// 규범 검사는 이 파일이 아니라 lib/ 의 순수 모듈이 한다 — 테스트 가능해야 회귀를 막는다.
//   lib/css-norms.mjs    산출 CSS (lightningcss 파서) — 그림자·링·팔레트 밖 색·라운드·다크모드
//   lib/source-norms.mjs 소스 (file:line) — 색 임의값·ring·그림자 유틸리티 토큰
//   설계와 근거: docs/design/namespaces.md 「게이트 — 정규식이 아니라 파서로」 · ADR 0006
//   여기는 dist 와 src 를 읽어 둘을 호출하고 결과를 출력하는 오케스트레이터다.

import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { checkCssNorms, normalizeHex } from "./lib/css-norms.mjs";
import { checkSourceNorms } from "./lib/source-norms.mjs";

// 실행 위치에 의존하지 않는다 — CWD 기준으로 잡으면 다른 디렉터리에서 부를 때 조용히 빗나간다.
const ROOT = resolve(import.meta.dirname, "..");
const ASSETS_DIRECTORY = join(ROOT, "dist", "assets");
const THEME_PATH = join(ROOT, "src", "shared", "ui", "theme.css");
const SOURCE_DIRECTORY = join(ROOT, "src");

/**
 * 상한값은 추측이 아니라 실측 + 여유분이다. 옆의 「측정」이 이 값을 정할 때의 실제 크기다.
 * 화면이 늘어 상한을 올려야 하면 **측정값과 함께 올린다** — 그래야 diff 에서 증가폭이 보인다.
 * 조용히 올리면 이 게이트는 의미를 잃는다.
 */
const BUDGETS = [
  { key: "jsGzip", limit: 92_000, measured: 75_223, label: "JS 합계 (gzip)" },
  { key: "jsChunkGzip", limit: 92_000, measured: 75_223, label: "최대 단일 JS 청크 (gzip)" },
  { key: "cssGzip", limit: 6_000, measured: 3_683, label: "CSS (gzip, @font-face 제외)" },
  // 폰트는 unicode-range 로 분할돼 전량 전송되지 않으므로 이 값은 전송량이 아니라 **배포 크기** 가드다.
  // 잡으려는 사고: variable/split(2.3 MB) 대신 static/split(8.8 MB)이나 static/complete(4.7 MB)를
  // 실수로 import 하는 것. 폰트 패치 릴리스가 몇 KB 늘어난 것만으로 빌드를 깨지 않도록 여유를 둔다.
  { key: "fontRaw", limit: 2_600_000, measured: 2_281_860, label: "폰트 파일 합계 (raw)" },
];

const NORM_LABELS = {
  shadow: "그림자·링 금지 — 「The Flat-By-Default Rule」 · D9 · D10",
  color: "팔레트 밖 색 금지 — 「The One Accent Rule」 · D8",
  radius: "라운드 토큰 밖 금지 — D1",
  dark: "다크모드 금지 — 라이트 전용",
  ring: "ring-* 금지 — D9",
};

const FONT_EXTENSIONS = new Set([".woff2", ".woff", ".ttf", ".otf"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const FONT_FACE_PATTERN = /@font-face\s*\{[^}]*\}/gu;

function formatBytes(value) {
  return `${value.toLocaleString("en-US")} B`;
}

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/**
 * theme.css 에서 화이트리스트를 읽는다. 목록을 스크립트에 손으로 두면 토큰과 조용히 어긋난다 —
 * 이 저장소가 별칭·Node 버전에서 거부해 온 이중 출처 패턴이다.
 * 주석을 먼저 걷어낸다 — 주석 안의 예시 hex 가 화이트리스트에 섞이면 게이트가 조용히 약해진다.
 */
function readTheme() {
  const text = readFileSync(THEME_PATH, "utf8").replaceAll(/\/\*[\s\S]*?\*\//gu, "");

  const palette = new Set();
  for (const [, hex] of text.matchAll(/--color-[\w-]+\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/gu)) {
    palette.add(normalizeHex(hex));
  }
  if (palette.size === 0) {
    throw new Error(`theme.css 에서 --color-* 를 하나도 읽지 못했다 — 경로나 형식이 바뀌었다: ${THEME_PATH}`);
  }
  const paletteSize = palette.size;
  palette.add("transparent"); // Preflight 의 #0000. 색 지정이 아니다.

  const radii = { names: new Set(), values: new Set() };
  for (const [, name, value] of text.matchAll(/(--radius-[\w-]+)\s*:\s*([^;]+);/gu)) {
    radii.names.add(name);
    radii.values.add(value.trim());
  }

  const retired = new Set([...text.matchAll(/(--[a-z-]+)-\*\s*:\s*initial/gu)].map((m) => m[1]));

  return { palette, paletteSize, radii, retired };
}

function collectAssets() {
  let entries;
  try {
    entries = readdirSync(ASSETS_DIRECTORY);
  } catch (error) {
    // cause 로 원본을 붙여 둔다 — 메시지만 갈아치우면 실제 실패 원인(권한·경로·타입)이 지워진다.
    throw new Error(
      [
        `산출물 디렉터리를 읽을 수 없다: ${ASSETS_DIRECTORY}`,
        "",
        "원인: vite build 가 돌지 않았거나 outDir 이 바뀌었다.",
        "조치: `npm run build` 로 전체 체인을 실행할 것. 이 스크립트만 단독으로 부르지 않는다.",
      ].join("\n"),
      { cause: error },
    );
  }

  const assets = { javascript: [], stylesheet: [], font: [] };
  for (const name of entries) {
    const path = join(ASSETS_DIRECTORY, name);
    if (!statSync(path).isFile()) continue;
    const extension = extensionOf(name);
    if (extension === ".js") assets.javascript.push({ name, bytes: readFileSync(path) });
    else if (extension === ".css") assets.stylesheet.push({ name, bytes: readFileSync(path) });
    else if (FONT_EXTENSIONS.has(extension)) assets.font.push({ name, size: statSync(path).size });
  }
  return assets;
}

function* walkSources(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walkSources(path);
    else if (SOURCE_EXTENSIONS.has(extensionOf(entry.name))) yield path;
  }
}

function measure(assets) {
  const chunkSizes = assets.javascript.map((asset) => gzipSync(asset.bytes, { level: 9 }).length);
  const jsGzip = chunkSizes.reduce((sum, size) => sum + size, 0);
  const jsChunkGzip = chunkSizes.length === 0 ? 0 : Math.max(...chunkSizes);

  // @font-face 블록을 걷어낸 뒤 잰다 — 화면이 늘어도 폰트 선언은 그대로라 함께 세면 증가를 못 본다.
  let cssGzip = 0;
  for (const sheet of assets.stylesheet) {
    const withoutFontFaces = sheet.bytes.toString("utf8").replaceAll(FONT_FACE_PATTERN, "");
    cssGzip += gzipSync(Buffer.from(withoutFontFaces, "utf8"), { level: 9 }).length;
  }

  const fontRaw = assets.font.reduce((sum, asset) => sum + asset.size, 0);

  return { jsGzip, jsChunkGzip, cssGzip, fontRaw };
}

// ── 실행 ───────────────────────────────────────────────────────────────────────────────────────

const theme = readTheme();
const assets = collectAssets();
const actual = measure(assets);

console.log("번들 예산 (실측)");
console.log(
  `  자산: JS ${assets.javascript.length}개 · CSS ${assets.stylesheet.length}개 · 폰트 ${assets.font.length}개`,
);

const breaches = [];
for (const budget of BUDGETS) {
  const value = actual[budget.key];
  const over = value > budget.limit;
  const share = Math.round((value / budget.limit) * 100);
  console.log(
    `  ${over ? "초과" : "통과"}  ${budget.label.padEnd(30)} ${formatBytes(value).padStart(13)} / ${formatBytes(budget.limit).padStart(13)}  (${share}%)`,
  );
  if (over) breaches.push({ budget, value });
}

// ── 규범 검사 — 예산과 별개로, 금지된 것이 산출물과 소스에 들어왔는지 본다 ──────────────────────

const violations = [];
const cssStats = { declarations: 0, colors: 0, radiusDeclarations: 0, shadowCustomProperties: 0 };
for (const sheet of assets.stylesheet) {
  const result = checkCssNorms(sheet.bytes.toString("utf8"), {
    filename: sheet.name,
    palette: theme.palette,
    radii: theme.radii,
  });
  violations.push(...result.violations);
  for (const key of Object.keys(cssStats)) cssStats[key] += result.stats[key];
}

let sourceFiles = 0;
for (const path of walkSources(SOURCE_DIRECTORY)) {
  sourceFiles += 1;
  violations.push(...checkSourceNorms(readFileSync(path, "utf8"), relative(ROOT, path).replaceAll("\\", "/")));
}

console.log("규범 (산출 CSS + 소스)");
console.log(
  `  검사  팔레트 ${theme.paletteSize}색 + 투명 1 · 라운드 토큰 ${theme.radii.names.size}종 · 선언 ${cssStats.declarations}개(색 ${cssStats.colors} · 라운드 ${cssStats.radiusDeclarations} · 그림자/링 커스텀 속성 ${cssStats.shadowCustomProperties}) · 소스 ${sourceFiles}파일`,
);
for (const [norm, label] of Object.entries(NORM_LABELS)) {
  const violated = violations.some((violation) => violation.norm === norm);
  console.log(`  ${violated ? "위반" : "통과"}  ${label}`);
}
// 한계를 숨기지 않는다 — 「막았다」고 적고 안 막히는 것이 이 저장소가 반복해 겪은 사고 클래스다.
console.log(
  "  한계  dist/assets/ 비재귀 · dist/index.html 인라인 <style> 미검사 · 팔레트 색의 임의값 하드코딩(bg-[#8b3f63])은 산출 CSS 검사 통과(소스 검사가 잡는다)",
);

if (violations.length > 0) {
  const lines = ["", "디자인 규범 위반이 있다.", ""];
  for (const [norm, label] of Object.entries(NORM_LABELS)) {
    const hits = violations.filter((violation) => violation.norm === norm);
    if (hits.length === 0) continue;
    lines.push(`  ${label} — ${hits.length}건`);
    for (const hit of hits.slice(0, 12)) lines.push(`    ${hit.where}`, `      ${hit.value}`);
    if (hits.length > 12) lines.push(`    … 외 ${hits.length - 12}건`);
    lines.push("");
  }
  lines.push("규범을 바꾸려면 docs/design/decisions.md 를 먼저 갱신한다. 여기서 예외를 만들지 않는다.");
  console.error(lines.join("\n"));
  process.exitCode = 1;
}

if (breaches.length > 0) {
  const lines = ["", "번들이 예산을 넘었다.", ""];
  for (const { budget, value } of breaches) {
    lines.push(
      `  ${budget.label}: ${formatBytes(value)} > ${formatBytes(budget.limit)} (기준을 정할 때 측정값은 ${formatBytes(budget.measured)}였다)`,
    );
  }
  lines.push(
    "",
    "원인: 의존성이 늘었거나, 트리셰이킹이 깨졌거나, 의도한 기능 추가다.",
    "조치: 먼저 무엇이 늘었는지 확인한다 — 의도한 증가라면 scripts/check-bundle-budget.mjs 의",
    "      BUDGETS 를 **새 측정값과 함께** 올린다. 측정값 없이 한도만 올리지 않는다.",
    "",
    "이대로 상한만 올리면 이 게이트는 다음 회귀를 잡지 못한다.",
  );
  console.error(lines.join("\n"));
  process.exitCode = 1;
}
